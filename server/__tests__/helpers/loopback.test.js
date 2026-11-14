/**
 * Why HTTP tests use helpers/loopback.js [FLAKY] (ADR F-067): a request that supertest sends to
 * its own wildcard-bound server can be answered by another server bound to 127.0.0.1 on the same
 * port (macOS); a server bound to 127.0.0.1 itself cannot be shadowed that way.
 */
const http = require('node:http');
const supertest = require('supertest');
const { LOOPBACK, serveOnLoopback, closeLoopbackServers } = require('./loopback');

const answering = (name) => (req, res) => res.end(name);

/** Try to bind a decoy server to 127.0.0.1:<port>; resolves the server, or the error code. */
function bindDecoy(port) {
    return new Promise((resolve) => {
        const decoy = http.createServer(answering('decoy'));
        decoy.once('error', (error) => resolve(error.code));
        decoy.listen(port, LOOPBACK, () => resolve(decoy));
    });
}

const close = (server) => new Promise((resolve) => server.close(() => resolve()));

afterEach(() => closeLoopbackServers());

test('the old way: a wildcard-bound test server can be shadowed on 127.0.0.1 (macOS) — the flake', async () => {
    const wildcard = http.createServer(answering('test server'));
    await new Promise((resolve) => wildcard.listen(0, resolve));
    const decoy = await bindDecoy(wildcard.address().port);
    try {
        if (process.platform === 'darwin') {
            // The connection to 127.0.0.1 reaches the more specific binding: the wrong server.
            expect(typeof decoy).toBe('object');
            expect((await supertest(wildcard).get('/')).text).toBe('decoy');
        } else {
            // Linux refuses the second bind, so CI never saw the flake.
            expect(decoy).toBe('EADDRINUSE');
        }
    } finally {
        if (typeof decoy === 'object') await close(decoy);
        await close(wildcard);
    }
});

test('serveOnLoopback: nobody else can bind its 127.0.0.1 port, so the test server answers', async () => {
    const server = await serveOnLoopback(answering('test server'));
    expect(server.address().address).toBe(LOOPBACK);
    expect(await bindDecoy(server.address().port)).toBe('EADDRINUSE');
    expect((await supertest(server).get('/')).text).toBe('test server');
});

test('a later wildcard bind on the same port does not take its traffic either', async () => {
    const server = await serveOnLoopback(answering('test server'));
    const wildcard = http.createServer(answering('decoy'));
    const bound = await new Promise((resolve) => {
        wildcard.once('error', () => resolve(false));
        wildcard.listen(server.address().port, () => resolve(true));
    });
    try {
        expect((await supertest(server).get('/')).text).toBe('test server');
    } finally {
        if (bound) await close(wildcard);
    }
});
