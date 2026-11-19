#!/usr/bin/env node
/**
 * The local game-server stack the parity harness plays real games on (ADR F-098):
 * a throwaway Redis plus `server/server.js` pointed at the TEST Supabase project.
 *
 *   node scripts/test-db/stack.js     (Playwright starts it as a webServer; Ctrl-C stops both)
 *
 * Refuses to run unless scripts/test-db/env.js accepts the env files. The server gets
 * server/.env.test on top of the current environment and runs from an empty working directory,
 * so dotenv never loads the production server/.env. Ports (all overridable):
 *   PARITY_SERVER_PORT 3202, PARITY_REDIS_PORT 6390, PARITY_PORT 3201 (the web app, for CORS).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { ROOT, loadTestEnv } = require('./env');

const DEFAULTS = Object.freeze({ webPort: '3201', serverPort: '3202', redisPort: '6390' });

function ports(env = process.env) {
    return {
        web: env.PARITY_PORT || DEFAULTS.webPort,
        server: env.PARITY_SERVER_PORT || DEFAULTS.serverPort,
        redis: env.PARITY_REDIS_PORT || DEFAULTS.redisPort,
    };
}

/** The game server's environment: test project values win over anything inherited. */
function serverEnv(testServerEnv, p, base = process.env) {
    return {
        ...base,
        ...testServerEnv,
        NODE_ENV: 'development',
        PORT: p.server,
        REDIS_URL: `redis://127.0.0.1:${p.redis}`,
        CORS_ORIGINS: `http://localhost:${p.web},http://127.0.0.1:${p.web}`,
        SOCKET_ADAPTER: 'redis',
    };
}

function start() {
    const env = loadTestEnv();
    const p = ports();
    const children = [];
    const stop = () => children.forEach((c) => c.kill('SIGTERM'));
    const redisBin = process.env.REDIS_SERVER_BIN || 'redis-server';
    children.push(
        spawn(redisBin, ['--port', p.redis, '--save', '', '--appendonly', 'no'], { stdio: ['ignore', 'ignore', 'inherit'] }),
    );
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'gambit-parity-server-'));
    children.push(
        spawn(process.execPath, [path.join(ROOT, 'server', 'server.js')], {
            cwd,
            env: serverEnv(env.server, p),
            stdio: 'inherit',
        }),
    );
    children.forEach((c) =>
        c.on('exit', (code) => {
            stop();
            process.exitCode = code ?? 1;
        }),
    );
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    console.log(`Parity stack: redis :${p.redis}, game server :${p.server} -> ${env.supabaseUrl}`);
}

if (require.main === module) {
    try {
        start();
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
}

module.exports = { ports, serverEnv };
