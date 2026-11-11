// @ts-check
/**
 * Legacy seam: the single global clock ticker (one interval per process).
 * The tick logic lives in src/services/clockService.js.
 */
const gameStore = require('../lib/gameStore');
const { supabase } = require('../supabase');
const { createGamesRepository } = require('../src/repositories/gamesRepository');
const { parseIncrementMs } = require('../src/domain/timeControl');
const { createClockService } = require('../src/services/clockService');
const { createIoEmitter } = require('../src/services/emitter');

const TICK_MS = 1000;
const gamesRepo = createGamesRepository(supabase);

/** @type {ReturnType<typeof setInterval> | null} */
let globalTicker = null;

/**
 * Required lazily, as before, so this module and ./rating never load each other eagerly.
 * @returns {{ processGameEnd: Function }}
 */
const getRatingService = () => require('./rating');

/**
 * @param {import('../src/services/emitter').IoLike} io
 */
function clockServiceFor(io) {
    return createClockService({ gameStore, gamesRepo, getRatingService, emitter: createIoEmitter(io) });
}

/**
 * Increment in ms from a time control such as "3+2".
 * @param {unknown} timeControl
 */
function parseIncrement(timeControl) {
    return parseIncrementMs(timeControl);
}

/**
 * Finalize a game ended by the clock or by abandonment (DB + rating).
 * @param {import('../src/services/emitter').IoLike} io
 * @param {string} gameId
 * @param {any} game
 * @param {string | null} winnerId
 * @param {string} [reason]
 */
// eslint-disable-next-line max-params -- legacy public signature pinned by __tests__/clock.test.js
function finalizeExpiredGame(io, gameId, game, winnerId, reason) {
    return clockServiceFor(io).finalizeExpiredGame({ gameId, game, winnerId, reason });
}

/**
 * Start the 1 s global ticker (no-op when already running).
 * @param {import('../src/services/emitter').IoLike} io
 */
function startGlobalClock(io) {
    if (globalTicker) return;

    const clockService = clockServiceFor(io);
    globalTicker = setInterval(() => clockService.tick(), TICK_MS);

    console.log('[Clock] Global ticker started');
}

function stopGlobalClock() {
    if (globalTicker) {
        clearInterval(globalTicker);
        globalTicker = null;
    }
}

module.exports = { startGlobalClock, stopGlobalClock, finalizeExpiredGame, parseIncrement };
