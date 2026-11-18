// @ts-check
/**
 * The account preferences the game server enforces (public.user_preferences,
 * ADR F-140): who may challenge a player, whether others may watch their
 * games, and which bell notifications they want. A user without a row has the
 * defaults below, which are the table's column defaults.
 */
const { timeControlOf } = require('./timeControl');

/**
 * @typedef {'everyone' | 'friends' | 'nobody'} ChallengePolicy
 * @typedef {'notify_challenges' | 'notify_game_results' | 'notify_your_turn'} NotificationColumn
 * @typedef {object} EnforcedPreferences
 * @property {ChallengePolicy} challenge_policy
 * @property {boolean} allow_spectators
 * @property {boolean} notify_challenges
 * @property {boolean} notify_game_results
 * @property {boolean} notify_your_turn
 */

/** @type {Readonly<EnforcedPreferences>} */
const DEFAULT_PREFERENCES = Object.freeze({
    challenge_policy: 'everyone',
    allow_spectators: true,
    notify_challenges: true,
    notify_game_results: true,
    notify_your_turn: true,
});

/** The columns read from user_preferences. */
const PREFERENCE_COLUMNS = ['user_id', ...Object.keys(DEFAULT_PREFERENCES)].join(', ');

const POLICIES = ['everyone', 'friends', 'nobody'];

/** A daily game: one day (or more) on the clock. */
const DAILY_MINUTES = 1440;

/**
 * A row (or no row) as preferences: anything missing or malformed is the default.
 * @param {Record<string, unknown> | null | undefined} row
 * @returns {EnforcedPreferences}
 */
function preferencesOf(row) {
    const src = row ?? {};
    /** @type {(key: keyof EnforcedPreferences) => boolean} */
    const flag = (key) =>
        typeof src[key] === 'boolean' ? /** @type {boolean} */ (src[key]) : Boolean(DEFAULT_PREFERENCES[key]);
    const policy = /** @type {ChallengePolicy} */ (
        POLICIES.includes(/** @type {string} */ (src.challenge_policy))
            ? src.challenge_policy
            : DEFAULT_PREFERENCES.challenge_policy
    );
    return {
        challenge_policy: policy,
        allow_spectators: flag('allow_spectators'),
        notify_challenges: flag('notify_challenges'),
        notify_game_results: flag('notify_game_results'),
        notify_your_turn: flag('notify_your_turn'),
    };
}

/**
 * Why a challenge to a player with `policy` is refused, or null when it may be sent.
 * @param {ChallengePolicy} policy
 * @param {boolean} areFriends
 * @returns {'challenges_closed' | 'friends_only' | null}
 */
function challengeRefusal(policy, areFriends) {
    if (policy === 'nobody') return 'challenges_closed';
    if (policy === 'friends' && !areFriends) return 'friends_only';
    return null;
}

/**
 * True for a daily game ("Your turn (daily games)" reminders).
 * @param {unknown} timeControl
 */
function isDailyTimeControl(timeControl) {
    return timeControlOf(timeControl).minutes >= DAILY_MINUTES;
}

module.exports = { DEFAULT_PREFERENCES, PREFERENCE_COLUMNS, preferencesOf, challengeRefusal, isDailyTimeControl };
