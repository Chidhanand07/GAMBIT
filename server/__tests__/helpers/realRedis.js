/**
 * A throwaway real Redis for tests that must run the actual Lua scripts.
 *
 *   REDIS_TEST_URL set     → use that server (e.g. a CI service container)
 *   redis-server available → spawn one on a free port, no persistence, and
 *                            stop it in afterAll
 *   neither                → `available` is false; callers skip with SKIP_REASON
 *   REDIS_TEST_DISABLE=1   → treated as neither (to exercise the skip path)
 *
 * Every test should use its own key namespace (uniqueNamespace) instead of
 * flushing, so a shared REDIS_TEST_URL server is never wiped.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const Redis = require('ioredis');

const CANDIDATE_BINARIES = [
    process.env.REDIS_SERVER_BIN,
    '/opt/homebrew/bin/redis-server',
    '/usr/local/bin/redis-server',
    '/usr/bin/redis-server',
    ...(process.env.PATH ?? '').split(path.delimiter).map((dir) => path.join(dir, 'redis-server')),
].filter(Boolean);

const BINARY = CANDIDATE_BINARIES.find((p) => fs.existsSync(p)) ?? null;
const available = process.env.REDIS_TEST_DISABLE !== '1' && Boolean(process.env.REDIS_TEST_URL || BINARY);
const SKIP_REASON = 'SKIPPED: no real Redis (set REDIS_TEST_URL or install redis-server) — Lua scripts not exercised';
const READY_TIMEOUT_MS = 5000;
const READY_POLL_MS = 50;

function freePort() {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.unref();
        srv.on('error', reject);
        srv.listen(0, '127.0.0.1', () => {
            const { port } = srv.address();
            srv.close(() => resolve(port));
        });
    });
}

/** One raw PING over TCP (no client library: a failed ioredis probe leaves timers behind). */
function pingOnce(port) {
    return new Promise((resolve) => {
        const sock = net.connect(port, '127.0.0.1');
        let reply = '';
        sock.setTimeout(READY_POLL_MS * 4, () => sock.destroy());
        sock.on('connect', () => sock.write('PING\r\n'));
        sock.on('data', (chunk) => {
            reply += chunk;
            if (reply.includes('\r\n')) sock.end();
        });
        sock.on('error', () => {});
        sock.on('close', () => resolve(reply.startsWith('+PONG')));
    });
}

async function waitUntilReady(port) {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (!(await pingOnce(port))) {
        if (Date.now() > deadline) throw new Error(`redis-server did not start on port ${port}`);
        await new Promise((r) => setTimeout(r, READY_POLL_MS));
    }
}

/**
 * Start (or attach to) a real Redis. Call in beforeAll; call `stop` in afterAll.
 * @returns {Promise<{ url: string, client: () => import('ioredis').Redis, stop: () => Promise<void> } | null>}
 *   null when no real Redis is available (the caller skips with SKIP_REASON)
 */
async function startRealRedis() {
    if (!available) return null;
    let child = null;
    let url = process.env.REDIS_TEST_URL;
    if (!url) {
        const port = await freePort();
        child = spawn(BINARY, ['--port', String(port), '--bind', '127.0.0.1', '--save', '', '--appendonly', 'no'], {
            stdio: 'ignore',
        });
        url = `redis://127.0.0.1:${port}`;
        await waitUntilReady(port);
    }
    const clients = [];
    return {
        url,
        client() {
            const c = new Redis(url);
            clients.push(c);
            return c;
        },
        async stop() {
            await Promise.all(clients.map((c) => c.quit().catch(() => c.disconnect())));
            if (child && child.exitCode === null) {
                const exited = new Promise((r) => child.once('exit', r));
                child.kill('SIGTERM');
                await exited;
            }
        },
    };
}

let nsCounter = 0;
/** A fresh key namespace per test (keys are `{<ns>}:...`). */
function uniqueNamespace(prefix = 'test') {
    nsCounter += 1;
    return `${prefix}-${process.pid}-${Date.now()}-${nsCounter}`;
}

module.exports = { available, SKIP_REASON, startRealRedis, uniqueNamespace };
