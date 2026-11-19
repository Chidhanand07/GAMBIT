/**
 * Test-project environment loader and guard (ADR F-097, SEC-08).
 *
 * Every script that writes to a database (migrate, seed, the local game-server stack) loads its
 * settings through `loadTestEnv()`, which refuses to run unless:
 *   - `frontend/.env.test.local` and `server/.env.test` exist and define the test project's URL
 *     and keys, plus `SUPABASE_TEST_DB_URL` (server file),
 *   - both files point at the same project,
 *   - at least one production URL is known (from `frontend/.env.local`, `server/.env` or the
 *     `PRODUCTION_SUPABASE_URL` variable) and the test project is none of them: not the same URL,
 *     not the same secret key, and the DB URL does not name the production project ref.
 *
 * No message ever contains a key, a password or a full connection string.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

const FILES = Object.freeze({
    frontendTest: 'frontend/.env.test.local',
    serverTest: 'server/.env.test',
    frontendProd: 'frontend/.env.local',
    serverProd: 'server/.env',
});

const REQUIRED = Object.freeze({
    frontendTest: ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY'],
    serverTest: ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_TEST_DB_URL'],
});

class TestEnvError extends Error {
    constructor(problems) {
        super(`Refusing to touch a database: the test-project environment is not safe.\n  - ${problems.join('\n  - ')}`);
        this.name = 'TestEnvError';
        this.problems = problems;
    }
}

/** dotenv-style parser: KEY=VALUE lines, `#` comments, optional quotes, `export ` prefix. */
function parseEnv(text) {
    const out = {};
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
        if (!match) continue;
        let value = match[2].trim();
        const quoted = /^(['"])(.*)\1$/.exec(value);
        if (quoted) value = quoted[2];
        else value = value.replace(/\s+#.*$/, '');
        out[match[1]] = value;
    }
    return out;
}

/** Lower-case origin without a trailing slash; '' for anything that is not a URL. */
function normalizeUrl(value) {
    if (!value) return '';
    try {
        const url = new URL(value.trim());
        return `${url.protocol}//${url.host}`.toLowerCase();
    } catch {
        return '';
    }
}

/** `abcdefgh` from `https://abcdefgh.supabase.co`; '' when the host has no project label. */
function projectRef(url) {
    const host = normalizeUrl(url).replace(/^https?:\/\//, '');
    const [label] = host.split('.');
    return host.includes('.') && label ? label : '';
}

function readEnvFile(root, rel) {
    const file = path.join(root, rel);
    return fs.existsSync(file) ? parseEnv(fs.readFileSync(file, 'utf8')) : null;
}

function missingKeys(env, keys) {
    return keys.filter((key) => !env[key] || !env[key].trim());
}

function productionValues(prodFrontend, prodServer, processEnv) {
    const urls = [prodFrontend?.NEXT_PUBLIC_SUPABASE_URL, prodServer?.SUPABASE_URL, processEnv.PRODUCTION_SUPABASE_URL]
        .map(normalizeUrl)
        .filter(Boolean);
    const keys = [prodFrontend?.SUPABASE_SECRET_KEY, prodServer?.SUPABASE_SECRET_KEY].filter(Boolean);
    return { urls: [...new Set(urls)], keys };
}

function productionProblems(test, prod) {
    if (prod.urls.length === 0) {
        return [
            `no production URL to compare against: ${FILES.frontendProd} and ${FILES.serverProd} are missing ` +
                'and PRODUCTION_SUPABASE_URL is not set (the guard fails closed)',
        ];
    }
    const problems = [];
    if (prod.urls.includes(test.url)) problems.push('the test Supabase URL equals the production URL');
    if (prod.keys.includes(test.frontendKey) || prod.keys.includes(test.serverKey)) {
        problems.push('a test secret key equals a production secret key');
    }
    const refs = prod.urls.map(projectRef).filter(Boolean);
    if (refs.some((ref) => test.dbUrl.includes(ref))) {
        problems.push('SUPABASE_TEST_DB_URL names the production project');
    }
    return problems;
}

/**
 * Pure check: reads the four env files under `root` and returns
 * `{ ok: true, env }` or `{ ok: false, problems }`.
 */
function checkTestEnv({ root = ROOT, processEnv = process.env } = {}) {
    const frontend = readEnvFile(root, FILES.frontendTest);
    const server = readEnvFile(root, FILES.serverTest);
    const problems = [];
    if (!frontend) problems.push(`${FILES.frontendTest} is missing`);
    if (!server) problems.push(`${FILES.serverTest} is missing`);
    if (frontend) problems.push(...missingKeys(frontend, REQUIRED.frontendTest).map((k) => `${FILES.frontendTest} has no ${k}`));
    if (server) problems.push(...missingKeys(server, REQUIRED.serverTest).map((k) => `${FILES.serverTest} has no ${k}`));
    if (problems.length) return { ok: false, problems };

    const test = {
        url: normalizeUrl(frontend.NEXT_PUBLIC_SUPABASE_URL),
        frontendKey: frontend.SUPABASE_SECRET_KEY,
        serverKey: server.SUPABASE_SECRET_KEY,
        dbUrl: server.SUPABASE_TEST_DB_URL,
    };
    if (!test.url) problems.push(`${FILES.frontendTest}: NEXT_PUBLIC_SUPABASE_URL is not a URL`);
    if (test.url && test.url !== normalizeUrl(server.SUPABASE_URL)) {
        problems.push(`${FILES.frontendTest} and ${FILES.serverTest} point at different Supabase projects`);
    }
    const prod = productionValues(readEnvFile(root, FILES.frontendProd), readEnvFile(root, FILES.serverProd), processEnv);
    problems.push(...productionProblems(test, prod));
    if (problems.length) return { ok: false, problems };
    return { ok: true, env: { frontend, server, supabaseUrl: test.url, dbUrl: test.dbUrl } };
}

/** `checkTestEnv`, but throws a `TestEnvError` instead of returning the problems. */
function loadTestEnv(options) {
    const result = checkTestEnv(options);
    if (!result.ok) throw new TestEnvError(result.problems);
    return result.env;
}

module.exports = { ROOT, FILES, TestEnvError, parseEnv, normalizeUrl, projectRef, checkTestEnv, loadTestEnv };
