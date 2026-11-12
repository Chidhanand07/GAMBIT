// @ts-check
/**
 * Legacy seam: the single global clock ticker (one interval per process).
 * The tick logic lives in src/services/clockService.js; the composition root
 * builds that service (it shares the game finalizer) and hands it in here.
 */
const { parseIncrementMs } = require('../src/domain/timeControl');

const TICK_MS = 1000;

/** @type {ReturnType<typeof setInterval> | null} */
let globalTicker = null;

/**
 * Increment in ms from a time control such as "3+2".
 * @param {unknown} timeControl
 */
function parseIncrement(timeControl) {
    return parseIncrementMs(timeControl);
}

/**
 * Start the 1 s global ticker (no-op when already running).
 * @param {{ tick: () => Promise<void> }} clockService
 */
function startGlobalClock(clockService) {
    if (globalTicker) return;

    globalTicker = setInterval(() => {
        void clockService.tick();
    }, TICK_MS);

    console.log('[Clock] Global ticker started');
}

function stopGlobalClock() {
    if (globalTicker) {
        clearInterval(globalTicker);
        globalTicker = null;
    }
}

module.exports = { startGlobalClock, stopGlobalClock, parseIncrement };
