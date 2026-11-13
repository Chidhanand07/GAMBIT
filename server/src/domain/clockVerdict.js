// @ts-check
/**
 * What the passing of time decides about an active game (NODE-16). Pure: the
 * caller passes the state and the time and gets a verdict or null. The clock
 * service asks on every tick, and the finalizer asks again on the state it
 * holds the lock on.
 */
const { REASON } = require('./adjudication');
const { activeRemainingMs, isGraceExpired } = require('./clock');
const { opponentColor, sideToColor } = require('./result');

/** How long each side has to make its first move before the game is aborted. */
const FIRST_MOVE_TIMEOUT_MS = 30000;

/**
 * @typedef {import('./gameState').GameState} GameState
 * @typedef {import('./adjudication').Verdict} Verdict
 */

/** @type {Verdict} */
const ABORTED = Object.freeze({ winner: null, reason: REASON.ABORTED, aborted: true });

/** Each side has made at least one move, so a real game is in progress. */
const PLIES_FOR_A_STARTED_GAME = 2;

/**
 * @param {GameState} game
 * @returns {boolean}
 */
function bothSidesMoved(game) {
    return (game.moveLog?.length ?? 0) >= PLIES_FOR_A_STARTED_GAME;
}

/**
 * When the side to move must have made its first move, or null when both
 * sides have moved (or the state carries no start time). White's window opens
 * when the game starts; Black's when White has moved.
 * @param {GameState} game
 * @returns {number | null}
 */
function firstMoveDeadline(game) {
    const plies = game.moveLog?.length ?? 0;
    if (bothSidesMoved(game) || !game.startedAt) return null;
    const windowOpened = plies === 0 ? game.startedAt : game.lastMoveAt;
    return windowOpened ? windowOpened + FIRST_MOVE_TIMEOUT_MS : null;
}

/**
 * Rules in precedence order: the first one that has an opinion decides, and
 * `undefined` means "not my case, ask the next". A new time-based rule is a
 * new entry here (SOLID-03).
 * @type {ReadonlyArray<(game: GameState, at: number) => Verdict | null | undefined>}
 */
const RULES = [
    // A player is away: the clocks are paused for the grace period. Then the
    // opponent wins, unless the game never got going (fewer than one move each):
    // that is an abort, like a first move that never came (G10).
    function abandonment(game, at) {
        const away = /** @type {{ side: string, at: number } | null} */ (game.disconnectInfo);
        if (!away) return undefined;
        if (!isGraceExpired(away, at)) return null;
        if (!bothSidesMoved(game)) return ABORTED;
        return { winner: opponentColor(away.side), reason: REASON.ABANDONMENT };
    },
    // A side never made its first move: no game was played, so nobody wins or loses.
    function firstMoveTimeout(game, at) {
        const deadline = firstMoveDeadline(game);
        if (deadline === null) return undefined;
        return at >= deadline ? ABORTED : undefined;
    },
    // The side to move is out of time.
    function flagFall(game, at) {
        if (!game.lastMoveAt || activeRemainingMs(game, at) > 0) return null;
        return { winner: opponentColor(sideToColor(game.activeSide)), reason: REASON.TIME };
    },
];

/**
 * The clock's verdict on `game` at `at`, or null while the game goes on.
 * @param {GameState | null | undefined} game
 * @param {number} at
 * @returns {Verdict | null}
 */
function clockVerdict(game, at) {
    if (!game || game.status !== 'active') return null;
    for (const rule of RULES) {
        const verdict = rule(game, at);
        if (verdict !== undefined) return verdict;
    }
    return null;
}

module.exports = { FIRST_MOVE_TIMEOUT_MS, firstMoveDeadline, clockVerdict };
