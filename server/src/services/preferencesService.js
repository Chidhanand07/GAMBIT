// @ts-check
/**
 * Enforcement of the account preferences (ADR F-140): challenge policy,
 * spectators and bell notifications. Privacy checks fail CLOSED: when the
 * preferences cannot be read, the challenge or the spectator is refused. A
 * notification whose preference cannot be read is not sent (a missed bell
 * entry is better than one the user turned off).
 */
const { challengeRefusal, preferencesOf } = require('../domain/preferences');
const { log } = require('../observability/log');

/**
 * @typedef {import('../domain/preferences').EnforcedPreferences} EnforcedPreferences
 * @typedef {import('../domain/preferences').NotificationColumn} NotificationColumn
 * @typedef {{ data: any, error: { message?: string } | null }} QueryResult
 *
 * @typedef {object} PreferencesDeps
 * @property {{ findByUserIds: (ids: string[]) => PromiseLike<QueryResult> }} preferencesRepo
 * @property {{ findAcceptedBetween: (a: string, b: string) => PromiseLike<QueryResult> }} friendshipsRepo
 * @property {{ insert: (row: object) => PromiseLike<unknown> }} notificationsRepo
 */

/** The answer when a preference needed for a privacy decision cannot be read. */
const UNAVAILABLE = 'preferences_unavailable';

/**
 * Preferences of each user (defaults for users without a row); throws when they cannot be read.
 * @param {PreferencesDeps} deps
 * @param {string[]} userIds
 * @returns {Promise<Map<string, EnforcedPreferences>>}
 */
async function preferencesFor({ preferencesRepo }, userIds) {
    const { data, error } = await preferencesRepo.findByUserIds(userIds);
    if (error) throw new Error(`user_preferences read failed: ${error.message}`);
    /** @type {Map<string, Record<string, unknown>>} */
    const rows = new Map((data ?? []).map((/** @type {any} */ row) => [row.user_id, row]));
    return new Map(userIds.map((id) => [id, preferencesOf(rows.get(id))]));
}

/**
 * @param {PreferencesDeps} deps
 * @param {string} fromId the verified challenger
 * @param {string} toId
 * @returns {Promise<string | null>} the refusal code, or null when the challenge may be sent
 */
async function challengeRefusalFor(deps, fromId, toId) {
    try {
        const policy = (await preferencesFor(deps, [toId])).get(toId)?.challenge_policy ?? 'everyone';
        if (policy !== 'friends') return challengeRefusal(policy, false);
        const { data, error } = await deps.friendshipsRepo.findAcceptedBetween(fromId, toId);
        if (error) throw new Error(`friendships read failed: ${error.message}`);
        return challengeRefusal(policy, (data ?? []).length > 0);
    } catch (e) {
        log.error('[preferences] challenge check failed:', /** @type {Error} */ (e).message);
        return UNAVAILABLE;
    }
}

/**
 * @param {PreferencesDeps} deps
 * @param {string[]} playerIds
 * @returns {Promise<boolean>} true only when every player allows spectators
 */
async function spectatingAllowed(deps, playerIds) {
    const ids = playerIds.filter(Boolean);
    try {
        const prefs = await preferencesFor(deps, ids);
        return ids.every((id) => prefs.get(id)?.allow_spectators === true);
    } catch (e) {
        log.error('[preferences] spectator check failed:', /** @type {Error} */ (e).message);
        return false;
    }
}

/**
 * Each user's gameplay switches (premoves, allow_takebacks; ADR F-146, F-166). Fails closed:
 * when the preferences cannot be read, every switch is off.
 * @param {PreferencesDeps} deps
 * @param {string[]} userIds
 * @returns {Promise<Map<string, { premoves: boolean, allowTakebacks: boolean }>>}
 */
async function gameplayOf(deps, userIds) {
    const ids = userIds.filter(Boolean);
    try {
        const prefs = await preferencesFor(deps, ids);
        return new Map(
            ids.map((id) => [
                id,
                { premoves: prefs.get(id)?.premoves === true, allowTakebacks: prefs.get(id)?.allow_takebacks === true },
            ]),
        );
    } catch (e) {
        log.error('[preferences] gameplay read failed:', /** @type {Error} */ (e).message);
        return new Map(ids.map((id) => [id, { premoves: false, allowTakebacks: false }]));
    }
}

/**
 * Insert one bell notification for `userId` if their `column` switch is on. Never throws.
 * @param {PreferencesDeps} deps
 * @param {{ userId: string, column: NotificationColumn, type: string, payload: object }} notification
 * @returns {Promise<boolean>} whether a row was inserted
 */
async function notify(deps, { userId, column, type, payload }) {
    try {
        const prefs = (await preferencesFor(deps, [userId])).get(userId);
        if (!prefs?.[column]) return false;
        const res = /** @type {QueryResult | undefined} */ (
            await deps.notificationsRepo.insert({
                user_id: userId,
                type,
                payload,
                read: false,
                created_at: new Date().toISOString(),
            })
        );
        if (res?.error) throw new Error(res.error.message);
        return true;
    } catch (e) {
        log.error(`[preferences] ${type} notification failed:`, /** @type {Error} */ (e).message);
        return false;
    }
}

/**
 * @param {PreferencesDeps} deps
 */
function createPreferencesService(deps) {
    return {
        /** @type {(fromId: string, toId: string) => Promise<string | null>} */
        challengeRefusal: (fromId, toId) => challengeRefusalFor(deps, fromId, toId),
        /** @type {(playerIds: string[]) => Promise<boolean>} */
        spectatingAllowed: (playerIds) => spectatingAllowed(deps, playerIds),
        /** @type {(userIds: string[]) => Promise<Map<string, { premoves: boolean, allowTakebacks: boolean }>>} */
        gameplayOf: (userIds) => gameplayOf(deps, userIds),
        /** @type {(n: { userId: string, column: NotificationColumn, type: string, payload: object }) => Promise<boolean>} */
        notify: (notification) => notify(deps, notification),
    };
}

module.exports = { createPreferencesService, UNAVAILABLE };
