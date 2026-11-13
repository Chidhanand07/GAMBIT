// @ts-check
/**
 * Request logging with a request id (NODE-20): every request gets an id (a
 * sane incoming `X-Request-Id` is kept, otherwise a new UUID), echoed in the
 * response header and bound to the request's log lines.
 */
const { randomUUID } = require('node:crypto');
const pinoHttp = require('pino-http');
const { log } = require('../observability/log');

/** Ids we accept from a proxy or client: short, no spaces or control characters. */
const REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @returns {string}
 */
function requestId(req, res) {
    const incoming = req.headers['x-request-id'];
    const id = typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
}

/** pino-http middleware bound to the process logger. */
function createRequestLog() {
    return pinoHttp({ logger: log.pino, genReqId: requestId, quietReqLogger: true });
}

module.exports = { createRequestLog };
