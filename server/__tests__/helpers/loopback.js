/**
 * Serve an Express app on 127.0.0.1 for supertest [FLAKY] (ADR F-067).
 *
 * `supertest(app)` listens on the wildcard address (`::`) and then connects to
 * 127.0.0.1. On macOS another process may still bind 127.0.0.1 on that same port
 * (BSD sockets allow a specific address next to a wildcard one) and then receives
 * every connection to 127.0.0.1:<port>, because the more specific binding wins. A
 * test request is then answered by somebody else's server (seen: a VS Code helper
 * answering "Cannot GET /api/health" with a 404). Linux refuses that second bind,
 * which is why CI never saw it.
 *
 * A server bound to 127.0.0.1 explicitly cannot be shadowed: a second bind of the
 * same address and port fails with EADDRINUSE, and a later wildcard bind is less
 * specific. Pass the returned server to supertest: `request(server)` uses its port
 * and does not open a server of its own.
 */
const http = require('node:http');
const supertest = require('supertest');

const LOOPBACK = '127.0.0.1';

/** @type {Set<import('node:http').Server>} */
const open = new Set();

/**
 * @param {import('node:http').RequestListener} app
 * @returns {Promise<import('node:http').Server>} listening on 127.0.0.1, on a free port
 */
function serveOnLoopback(app) {
    return new Promise((resolve, reject) => {
        const server = http.createServer(app);
        server.once('error', reject);
        server.listen(0, LOOPBACK, () => {
            open.add(server);
            resolve(server);
        });
    });
}

/**
 * A supertest client for an app served on 127.0.0.1 (for tests that build an app per test).
 * @param {import('node:http').RequestListener} app
 */
async function loopbackRequest(app) {
    return supertest(await serveOnLoopback(app));
}

/** Close every server this helper opened (call in afterEach/afterAll). */
async function closeLoopbackServers() {
    const servers = [...open];
    open.clear();
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(() => resolve(undefined)))));
}

module.exports = { LOOPBACK, serveOnLoopback, loopbackRequest, closeLoopbackServers };
