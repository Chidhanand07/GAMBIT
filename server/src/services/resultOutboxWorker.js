// @ts-check
/**
 * Re-drives finished games whose `games` row the finalizer could not write
 * (ERRORS, ADR F-066). Every few seconds one instance (SET NX PX lock with a
 * token, released by compare-and-delete) takes the items that are due and,
 * for each:
 *
 *   1. writes the row through the same guard as the finalizer
 *      (`finishIfActive`: only a row still `active` changes), so a row that did
 *      land after all, or that another worker wrote, is not written twice;
 *   2. reviews the game if this write finished the row, and rates it: the
 *      rating function applies a game once (`rated_at`), so a repeat is a no-op;
 *   3. forgets the item. Only then: a crash before this step re-drives again,
 *      which steps 1 and 2 make harmless.
 *
 * A failed write is retried with backoff (domain/redrivePolicy.js). After too
 * many attempts, or once the first failure is too old, the item is parked: it
 * stays in Redis for an operator (DEPLOY.md), and a `fatal` log line and an
 * error report name the game.
 */
const { randomUUID } = require('node:crypto');
const { afterFailure, DEFAULT_REDRIVE_POLICY } = require('../domain/redrivePolicy');
const { applyResultEffects } = require('./gameResultEffects');
const { log } = require('../observability/log');
const { reportError } = require('../observability/errorReporter');

const DEFAULT_INTERVAL_MS = 5000;
/** Longer than a pass is expected to take; if it lapses early, the guards above still hold. */
const DEFAULT_LOCK_TTL_MS = 30_000;
const DEFAULT_BATCH_SIZE = 20;
const MS_PER_SECOND = 1000;

/**
 * @typedef {import('../repositories/gameResultOutboxRepository').OutboxItem} OutboxItem
 * @typedef {import('../repositories/gameResultOutboxRepository').ResultOutbox} ResultOutbox
 * @typedef {object} WorkerDeps
 * @property {ResultOutbox} outbox
 * @property {{ finishIfActive: (gameId: string, row: object) => PromiseLike<{ data: unknown, error: any }> }} gamesRepo
 * @property {{ processGameEnd: Function }} ratingService
 * @property {{ triggerGameReview: (gameId: string, moveLog: any, timeControl: unknown) => void }} reviewService
 * @property {import('./emitter').Emitter} emitter
 * @property {() => number} [now]
 * @property {() => string} [newToken] lock token per pass
 * @property {number} [intervalMs]
 * @property {number} [lockTtlMs]
 * @property {number} [batchSize]
 * @property {import('../domain/redrivePolicy').RedrivePolicy} [policy]
 */

/**
 * Write the row; resolves the updated row (null: not active any more), rejects on a database error.
 * @param {WorkerDeps['gamesRepo']} gamesRepo
 * @param {OutboxItem} item
 */
async function writeRow(gamesRepo, item) {
    const { data, error } = await gamesRepo.finishIfActive(item.gameId, item.row);
    if (error) throw new Error(error.message ?? String(error));
    return data;
}

/**
 * Count the failure; reschedule it, or park it and raise the alert.
 * @param {Required<WorkerDeps>} deps
 * @param {OutboxItem} item
 * @param {unknown} error
 */
async function recordFailure({ outbox, now, policy }, item, error) {
    const lastError = /** @type {Error} */ (error)?.message ?? String(error);
    const next = { ...item, attempts: item.attempts + 1, lastError };
    const decision = afterFailure(next, now(), policy);
    if (!decision.park) {
        await outbox.reschedule(next, decision.at);
        const inSeconds = Math.round((decision.at - now()) / MS_PER_SECOND);
        log.warn(
            `[outbox] game ${item.gameId}: re-drive ${next.attempts} failed, next try in ${inSeconds} s:`,
            lastError,
        );
        return;
    }
    await outbox.park(next, now());
    const message = `[outbox] game ${item.gameId}: result still not persisted after ${next.attempts} re-drives; parked for an operator`;
    log.fatal(message, lastError);
    await reportError(new Error(`${message}: ${lastError}`), {
        level: 'fatal',
        where: 'outbox',
        gameId: item.gameId,
        attempts: next.attempts,
    });
}

/**
 * @param {Required<WorkerDeps>} deps
 * @param {OutboxItem} item
 */
async function redrive(deps, item) {
    let updated;
    try {
        updated = await writeRow(deps.gamesRepo, item);
    } catch (e) {
        await recordFailure(deps, item, e);
        return;
    }
    await applyResultEffects(deps, item, { review: Boolean(updated) });
    await deps.outbox.remove(item.gameId);
    log.info(`[outbox] game ${item.gameId}: result persisted on re-drive ${item.attempts + 1}`);
}

/**
 * @param {WorkerDeps} options
 */
function createResultOutboxWorker({
    now = () => Date.now(),
    newToken = () => randomUUID(),
    intervalMs = DEFAULT_INTERVAL_MS,
    lockTtlMs = DEFAULT_LOCK_TTL_MS,
    batchSize = DEFAULT_BATCH_SIZE,
    policy = DEFAULT_REDRIVE_POLICY,
    ...rest
}) {
    /** @type {Required<WorkerDeps>} */
    const deps = { ...rest, now, newToken, intervalMs, lockTtlMs, batchSize, policy };
    /** @type {ReturnType<typeof setInterval> | null} */
    let timer = null;

    /**
     * One pass, if this worker gets the lock.
     * @returns {Promise<number>} items attempted (0 also when another worker holds the lock)
     */
    async function runOnce() {
        const token = newToken();
        if (!(await deps.outbox.acquireLock(token, lockTtlMs))) return 0;
        try {
            const items = await deps.outbox.due(now(), batchSize);
            for (const item of items) await redrive(deps, item);
            return items.length;
        } finally {
            await deps.outbox.releaseLock(token);
        }
    }

    const tick = () =>
        runOnce().catch((e) => log.error('[outbox] pass failed:', /** @type {Error} */ (e)?.message ?? e));

    return {
        runOnce,
        /** Start the periodic pass (does not keep the process alive). */
        start() {
            if (timer) return;
            timer = setInterval(() => void tick(), intervalMs);
            timer.unref?.();
        },
        /** Stop the periodic pass (shutdown). A pass already running finishes. */
        stop() {
            if (timer) clearInterval(timer);
            timer = null;
        },
    };
}

module.exports = { createResultOutboxWorker };
