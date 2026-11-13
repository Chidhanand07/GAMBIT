// @ts-check
/**
 * Structured logging (NODE-20): JSON lines on stdout via pino, with secrets
 * redacted. Code logs through the small port below, `log.error(message, detail?)`,
 * which writes `{ detail, msg }`; `log.child({ socketId, userId, gameId })`
 * adds context to every line. `log.pino` is the underlying instance (pino-http
 * uses it for request logs).
 */
const os = require('node:os');
const pino = require('pino');
const env = require('../config/env');

/** Anything that can carry a credential, wherever it appears in a log object. */
const REDACT_PATHS = Object.freeze([
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers["x-engine-key"]',
    'res.headers["set-cookie"]',
    'headers.authorization',
    'headers.cookie',
    'headers["x-engine-key"]',
    '*.token',
    '*.access_token',
    '*.refresh_token',
    '*.password',
    '*.secret',
    '*.apiKey',
    '*.serviceKey',
    'detail.token',
    'detail.headers.authorization',
]);

/**
 * @typedef {object} Log
 * @property {(message: string, detail?: unknown) => void} error
 * @property {(message: string, detail?: unknown) => void} warn
 * @property {(message: string, detail?: unknown) => void} info
 * @property {(message: string, detail?: unknown) => void} fatal
 * @property {(bindings: Record<string, unknown>) => Log} child
 * @property {import('pino').Logger} pino
 */

/**
 * @param {import('pino').Logger} logger
 * @returns {Log}
 */
function adapt(logger) {
    /** @param {'error' | 'warn' | 'info' | 'fatal'} level */
    const at = (level) => (/** @type {string} */ message, /** @type {unknown} */ detail) => {
        if (detail === undefined) logger[level](message);
        else logger[level]({ detail }, message);
    };
    return {
        error: at('error'),
        warn: at('warn'),
        info: at('info'),
        fatal: at('fatal'),
        child: (bindings) => adapt(logger.child(bindings)),
        pino: logger,
    };
}

/**
 * @param {{ level?: string, destination?: import('pino').DestinationStream }} [options]
 * @returns {Log}
 */
function createLogger({ level = env.logLevel(), destination } = {}) {
    const options = {
        level,
        // hostname and pid tell replicas apart (setting `base` drops pino's defaults).
        base: { service: 'gambit-server', hostname: os.hostname(), pid: process.pid },
        timestamp: pino.stdTimeFunctions.isoTime,
        redact: { paths: [...REDACT_PATHS], censor: '[REDACTED]' },
    };
    return adapt(destination ? pino(options, destination) : pino(options));
}

/** The process-wide logger. */
const log = createLogger();
// Configuration warnings are logged through it (config cannot import the logger).
env.setWarningSink((message) => log.warn(message));

module.exports = { log, createLogger, REDACT_PATHS };
