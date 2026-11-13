// @ts-check
/**
 * Per-IP rate limit for the HTTP routes that cost something (NODE-12). A
 * limited request gets `429 { error: 'rate_limited' }` with `Retry-After`
 * (seconds) before the route runs. The client IP is `req.ip`; the app trusts
 * one proxy hop (Railway's), see http/app.js.
 */
const { httpRuleFor } = require('../services/rateLimitRules');

const HTTP_TOO_MANY_REQUESTS = 429;
const MS_PER_SECOND = 1000;

/**
 * @param {{ limiter: { check: (rule: string, subject: string) => Promise<{ ok: boolean, retryAfterMs?: number }> } }} deps
 * @returns {import('express').RequestHandler}
 */
function createHttpRateLimit({ limiter }) {
    return (req, res, next) => {
        const rule = httpRuleFor(req.path);
        if (!rule) return next();
        void limiter.check(rule, req.ip ?? 'unknown').then((result) => {
            if (result.ok) return next();
            res.set('Retry-After', String(Math.ceil((result.retryAfterMs ?? 0) / MS_PER_SECOND)));
            res.status(HTTP_TOO_MANY_REQUESTS).json({ error: 'rate_limited' });
        }, next);
    };
}

module.exports = { createHttpRateLimit };
