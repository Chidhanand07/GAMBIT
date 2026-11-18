'use strict';

// Run with: node --test scripts/test-db/*.test.js   (Node built-ins only)

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { checkTestEnv, loadTestEnv, parseEnv, projectRef, TestEnvError } = require('./env');

const PROD_URL = 'https://prodref123.supabase.co';
const TEST_URL = 'https://testref456.supabase.co';
const TEST_DB = 'postgresql://postgres.testref456:pw@aws-0-eu.pooler.supabase.com:6543/postgres';

const files = {
    prodFrontend: `NEXT_PUBLIC_SUPABASE_URL=${PROD_URL}\nSUPABASE_SECRET_KEY=sb_secret_prod\n`,
    prodServer: `SUPABASE_URL=${PROD_URL}\nSUPABASE_SECRET_KEY=sb_secret_prod\n`,
    testFrontend: `NEXT_PUBLIC_SUPABASE_URL=${TEST_URL}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_t\nSUPABASE_SECRET_KEY=sb_secret_test\n`,
    testServer: `SUPABASE_URL=${TEST_URL}/\nSUPABASE_SECRET_KEY=sb_secret_test\nSUPABASE_TEST_DB_URL="${TEST_DB}"\n`,
};

/** A throwaway repo root with the given env files (undefined = file absent). */
function sandbox({ prodFrontend, prodServer, testFrontend, testServer }) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'test-db-env-'));
    fs.mkdirSync(path.join(root, 'frontend'));
    fs.mkdirSync(path.join(root, 'server'));
    const write = (rel, text) => text !== undefined && fs.writeFileSync(path.join(root, rel), text);
    write('frontend/.env.local', prodFrontend);
    write('server/.env', prodServer);
    write('frontend/.env.test.local', testFrontend);
    write('server/.env.test', testServer);
    return root;
}

const check = (overrides, processEnv = {}) => checkTestEnv({ root: sandbox({ ...files, ...overrides }), processEnv });

test('accepts a separate test project and returns its settings', () => {
    const result = check({});
    assert.equal(result.ok, true);
    assert.equal(result.env.supabaseUrl, TEST_URL);
    assert.equal(result.env.dbUrl, TEST_DB);
});

test('refuses when frontend/.env.test.local is missing', () => {
    const result = check({ testFrontend: undefined });
    assert.equal(result.ok, false);
    assert.match(result.problems.join('\n'), /frontend\/\.env\.test\.local is missing/);
});

test('refuses when server/.env.test is missing', () => {
    const result = check({ testServer: undefined });
    assert.equal(result.ok, false);
    assert.match(result.problems.join('\n'), /server\/\.env\.test is missing/);
});

test('refuses when SUPABASE_TEST_DB_URL is missing', () => {
    const result = check({ testServer: `SUPABASE_URL=${TEST_URL}\nSUPABASE_SECRET_KEY=sb_secret_test\n` });
    assert.equal(result.ok, false);
    assert.match(result.problems.join('\n'), /no SUPABASE_TEST_DB_URL/);
});

test('refuses when the test URL is the production URL (any spelling)', () => {
    const prodAsTest = files.testFrontend.replace(TEST_URL, 'HTTPS://PRODREF123.supabase.co/');
    const result = check({ testFrontend: prodAsTest, testServer: files.testServer.replace(TEST_URL, PROD_URL) });
    assert.equal(result.ok, false);
    assert.match(result.problems.join('\n'), /equals the production URL/);
});

test('refuses a DB URL that names the production project', () => {
    const result = check({ testServer: files.testServer.replace(TEST_DB, 'postgresql://postgres.prodref123:pw@host/db') });
    assert.equal(result.ok, false);
    assert.match(result.problems.join('\n'), /names the production project/);
});

test('refuses a test secret key that equals the production key', () => {
    const result = check({ testServer: files.testServer.replace('sb_secret_test', 'sb_secret_prod') });
    assert.equal(result.ok, false);
    assert.match(result.problems.join('\n'), /secret key equals a production secret key/);
});

test('refuses when the two test files name different projects', () => {
    const result = check({ testServer: files.testServer.replace(TEST_URL, 'https://otherref.supabase.co') });
    assert.equal(result.ok, false);
    assert.match(result.problems.join('\n'), /different Supabase projects/);
});

test('fails closed when no production URL is known; PRODUCTION_SUPABASE_URL fills in (CI)', () => {
    const noProd = { prodFrontend: undefined, prodServer: undefined };
    assert.equal(check(noProd).ok, false);
    assert.match(check(noProd).problems.join('\n'), /no production URL to compare against/);
    assert.equal(check(noProd, { PRODUCTION_SUPABASE_URL: PROD_URL }).ok, true);
    assert.equal(check({ ...noProd, testFrontend: files.testFrontend.replace(TEST_URL, PROD_URL) }, { PRODUCTION_SUPABASE_URL: PROD_URL }).ok, false);
});

test('loadTestEnv throws a TestEnvError that never prints a secret', () => {
    const root = sandbox({ ...files, testServer: files.testServer.replace('sb_secret_test', 'sb_secret_prod') });
    assert.throws(
        () => loadTestEnv({ root, processEnv: {} }),
        (err) => err instanceof TestEnvError && !/sb_secret|pw@/.test(err.message),
    );
});

test('parseEnv handles comments, quotes and export; projectRef reads the host label', () => {
    assert.deepEqual(parseEnv('# c\nexport A=1\nB="x y"\nC=z # note\n\nbad line\n'), { A: '1', B: 'x y', C: 'z' });
    assert.equal(projectRef('https://abc.supabase.co/'), 'abc');
    assert.equal(projectRef('not a url'), '');
});
