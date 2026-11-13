// @ts-check
/**
 * ErrorReporter (observability/errorReporter.js) that POSTs one JSON document
 * per error to a webhook (`ERROR_WEBHOOK_URL`), SEC-12 without a dependency.
 * The body carries `text` and `content` (a one-line summary, the fields Slack
 * and Discord incoming webhooks display) plus structured fields for anything
 * that parses JSON.
 *
 * Safe by construction: at most `maxPerMinute` reports a minute (the rest are
 * counted and dropped, so an error storm cannot flood the receiver or our
 * event loop); a `timeoutMs` abort on each POST; context keys that look like
 * credentials are replaced with '[REDACTED]'; a failed POST is logged at warn
 * and never rethrown. The webhook URL itself is a secret and is never logged.
 */
const { log } = require('../observability/log');

const MINUTE_MS = 60 * 1000;
const DEFAULT_TIMEOUT_MS = 2000;
const DEFAULT_MAX_PER_MINUTE = 20;
const MAX_STACK_CHARS = 4000;
const CREDENTIAL_KEY = /token|password|secret|authorization|cookie|api[-_]?key/i;

/**
 * @typedef {import('../observability/errorReporter').ReportContext} ReportContext
 * @typedef {import('../observability/errorReporter').ErrorReporter} ErrorReporter
 */

/**
 * @param {unknown} error
 * @returns {{ name: string, message: string, stack?: string }}
 */
function describe(error) {
    if (error instanceof Error) {
        return { name: error.name, message: error.message, stack: error.stack?.slice(0, MAX_STACK_CHARS) };
    }
    const message = /** @type {{ message?: unknown } | null} */ (error)?.message;
    return { name: 'NonError', message: String(message ?? error) };
}

/**
 * Shallow copy of `context` with credential-like keys redacted.
 * @param {ReportContext} context
 */
function redact(context) {
    return Object.fromEntries(
        Object.entries(context).map(([key, value]) => [key, CREDENTIAL_KEY.test(key) ? '[REDACTED]' : value]),
    );
}

/**
 * The JSON document sent for one error.
 * @param {{ service: string, release?: string, hostname?: string }} origin
 * @param {unknown} error
 * @param {ReportContext} context
 * @param {number} nowMs
 */
function buildReport(origin, error, context, nowMs) {
    const described = describe(error);
    const level = context.level ?? 'error';
    const summary = `[${origin.service}] ${level} in ${context.where}: ${described.message}`;
    return {
        text: summary,
        content: summary,
        ...origin,
        level,
        time: new Date(nowMs).toISOString(),
        error: described,
        context: redact(context),
    };
}

/**
 * @param {object} options
 * @param {string} options.url the webhook (https)
 * @param {{ service: string, release?: string, hostname?: string }} options.origin
 * @param {number} [options.timeoutMs]
 * @param {number} [options.maxPerMinute]
 * @param {() => number} [options.now]
 * @returns {ErrorReporter & { dropped: () => number }}
 */
function createWebhookErrorReporter({
    url,
    origin,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxPerMinute = DEFAULT_MAX_PER_MINUTE,
    now = () => Date.now(),
}) {
    const budget = { startedAt: -Infinity, sent: 0, dropped: 0 };

    /** @returns {boolean} whether this report may be sent */
    function take() {
        if (now() - budget.startedAt >= MINUTE_MS) Object.assign(budget, { startedAt: now(), sent: 0 });
        if (budget.sent >= maxPerMinute) {
            budget.dropped += 1;
            return false;
        }
        budget.sent += 1;
        return true;
    }

    return {
        async report(error, context) {
            if (!take()) return;
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(buildReport(origin, error, context, now())),
                    signal: AbortSignal.timeout(timeoutMs),
                });
                if (!res.ok) log.warn('[error-reporter] webhook answered', res.status);
            } catch (e) {
                log.warn('[error-reporter] webhook failed:', /** @type {Error} */ (e).message);
            }
        },
        dropped: () => budget.dropped,
    };
}

module.exports = { createWebhookErrorReporter, buildReport };
