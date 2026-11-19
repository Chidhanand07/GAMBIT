// @ts-check
/**
 * Live spectator counts (ADR F-130). The set of watchers lives in Redis (the
 * spectators repository), so every instance counts the same viewers; this
 * instance only remembers which of ITS sockets watch which game, to refresh
 * them every heartbeat and to drop them when the socket goes.
 *
 * Every change of a game's set is announced to its room as
 * `spectators_changed { game_id, count }`; through the Socket.IO Redis adapter
 * that reaches the room's sockets on every instance (F-059).
 */
const { SPECTATOR_HEARTBEAT_MS, spectatorMember, watcherCount } = require('../domain/spectators');
const { gameRoom } = require('./emitter');
const { log } = require('../observability/log');

/**
 * @typedef {import('./emitter').Emitter} Emitter
 * @typedef {ReturnType<typeof import('../repositories/spectatorsRepository').createSpectatorsRepository>} SpectatorsRepo
 * @typedef {{ userId: string, games: Set<string> }} LocalViewer
 * @typedef {{ repo: SpectatorsRepo, emitter: Emitter, now: () => number,
 *   local: Map<string, LocalViewer> }} SpectatorCtx
 */

/**
 * Tell the room the new count when the set changed; the count either way.
 * @param {SpectatorCtx} ctx
 * @param {string} gameId
 * @param {import('../repositories/spectatorsRepository').SpectatorSet} set
 */
function announce(ctx, gameId, set) {
    const count = watcherCount(set.members);
    if (set.changed) ctx.emitter.toRoom(gameRoom(gameId), 'spectators_changed', { game_id: gameId, count });
    return count;
}

/**
 * @param {SpectatorCtx} ctx
 * @param {string} gameId
 * @param {string} userId
 * @param {string} socketId
 */
async function watch(ctx, gameId, userId, socketId) {
    const viewer = ctx.local.get(socketId) ?? { userId, games: new Set() };
    viewer.games.add(gameId);
    ctx.local.set(socketId, viewer);
    const set = await ctx.repo.add({ gameId, member: spectatorMember(userId, socketId), now: ctx.now() });
    return announce(ctx, gameId, set);
}

/**
 * @param {SpectatorCtx} ctx
 * @param {string} gameId
 * @param {string} socketId
 * @returns {Promise<boolean>} whether this socket was watching the game
 */
async function unwatch(ctx, gameId, socketId) {
    const viewer = ctx.local.get(socketId);
    if (!viewer?.games.delete(gameId)) return false;
    if (viewer.games.size === 0) ctx.local.delete(socketId);
    const set = await ctx.repo.remove({ gameId, member: spectatorMember(viewer.userId, socketId), now: ctx.now() });
    announce(ctx, gameId, set);
    return true;
}

/**
 * @param {SpectatorCtx} ctx
 * @param {string} socketId
 */
async function unwatchAll(ctx, socketId) {
    for (const gameId of [...(ctx.local.get(socketId)?.games ?? [])]) await unwatch(ctx, gameId, socketId);
}

/**
 * The current count, after dropping lapsed members (announced if any lapsed).
 * @param {SpectatorCtx} ctx
 * @param {string} gameId
 */
async function count(ctx, gameId) {
    return announce(ctx, gameId, await ctx.repo.prune(gameId, ctx.now()));
}

/**
 * One heartbeat: keep this instance's spectators alive (re-adding one that lapsed during
 * a long pause), then prune every game's lapsed members (another instance's crash).
 * @param {SpectatorCtx} ctx
 */
async function heartbeat(ctx) {
    for (const [socketId, { userId, games }] of ctx.local) {
        for (const gameId of games) {
            const ref = { gameId, member: spectatorMember(userId, socketId), now: ctx.now() };
            if (!(await ctx.repo.refresh(ref))) announce(ctx, gameId, await ctx.repo.add(ref));
        }
    }
    for (const gameId of await ctx.repo.games()) await count(ctx, gameId);
}

/**
 * @param {{ repo: SpectatorsRepo, emitter: Emitter, now?: () => number, heartbeatMs?: number }} deps
 */
function createSpectatorService({ repo, emitter, now = () => Date.now(), heartbeatMs = SPECTATOR_HEARTBEAT_MS }) {
    /** @type {SpectatorCtx} */
    const ctx = { repo, emitter, now, local: new Map() };
    /** @type {ReturnType<typeof setInterval> | undefined} */
    let timer;
    return {
        /** A non-player socket started watching; the count after it joined. */
        watch: (/** @type {string} */ gameId, /** @type {string} */ userId, /** @type {string} */ socketId) =>
            watch(ctx, gameId, userId, socketId),
        /** @type {(gameId: string, socketId: string) => Promise<boolean>} */
        unwatch: (gameId, socketId) => unwatch(ctx, gameId, socketId),
        /** @type {(socketId: string) => Promise<void>} */
        unwatchAll: (socketId) => unwatchAll(ctx, socketId),
        /** @type {(gameId: string) => Promise<number>} */
        count: (gameId) => count(ctx, gameId),
        /**
         * Counts for several games (the lobby's live list).
         * @param {string[]} gameIds
         * @returns {Promise<Record<string, number>>}
         */
        async counts(gameIds) {
            const entries = await Promise.all(gameIds.map(async (id) => [id, await count(ctx, id)]));
            return Object.fromEntries(entries);
        },
        heartbeat: () => heartbeat(ctx),
        start() {
            timer = setInterval(() => {
                heartbeat(ctx).catch((e) => log.error('[spectators] heartbeat failed:', e.message));
            }, heartbeatMs);
            timer.unref?.();
        },
        stop: () => clearInterval(timer),
    };
}

module.exports = { createSpectatorService };
