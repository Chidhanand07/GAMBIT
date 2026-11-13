// @ts-check
/**
 * Per-user, per-event-type rate limit for socket events (NODE-12). Runs as
 * `socket.use` middleware, before validation and the handler: a limited event
 * is acknowledged `{ ok: false, error: 'rate_limited', retryAfterMs }` (when
 * the client asked for an ack) and goes no further.
 */
const { socketRuleFor } = require('../services/rateLimitRules');

/**
 * @param {{ limiter: { check: (rule: string, subject: string) => Promise<{ ok: boolean, retryAfterMs?: number }> } }} deps
 * @returns {(socket: { data: Record<string, any> }) => (packet: unknown[], next: (err?: Error) => void) => void}
 */
function createSocketRateLimit({ limiter }) {
    return (socket) => (packet, next) => {
        const [event] = packet;
        const name = String(event);
        void limiter.check(socketRuleFor(name), `${socket.data.userId}:${name}`).then(
            (result) => {
                if (result.ok) return next();
                const ack = packet[packet.length - 1];
                if (typeof ack === 'function') {
                    ack({ ok: false, error: 'rate_limited', retryAfterMs: result.retryAfterMs });
                }
            },
            () => next(), // the limiter itself never rejects; if it does, do not drop the event
        );
    };
}

module.exports = { createSocketRateLimit };
