'use strict';

// Run with: node --test scripts/sync-shared.test.js   (Node built-ins only)

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const COPIES = ['server/src/domain/timeControl.data.json', 'frontend/lib/chess/timeControl.data.json'];

/** A throwaway repo with the script and shared/time-control.json; `present` copies exist. */
function sandbox(present) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-shared-'));
    fs.mkdirSync(path.join(root, 'scripts'));
    fs.copyFileSync(path.join(__dirname, 'sync-shared.js'), path.join(root, 'scripts', 'sync-shared.js'));
    fs.mkdirSync(path.join(root, 'shared'));
    fs.writeFileSync(path.join(root, 'shared', 'time-control.json'), '{"v":1}\n');
    for (const copy of COPIES) fs.mkdirSync(path.dirname(path.join(root, copy)), { recursive: true });
    for (const copy of present) fs.writeFileSync(path.join(root, copy), '{"v":1}\n');
    const run = (...args) => spawnSync(process.execPath, [path.join(root, 'scripts', 'sync-shared.js'), ...args], { encoding: 'utf8' });
    return { root, run };
}

test('--check: a missing copy is out of date (exit 1); all present and equal is clean (exit 0)', () => {
    const missing = sandbox([COPIES[0]]).run('--check');
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /out of date: frontend\/lib\/chess\/timeControl\.data\.json/);
    assert.equal(sandbox(COPIES).run('--check').status, 0);
});

test('write mode creates a missing copy with the shared content', () => {
    const { root, run } = sandbox([]);
    assert.equal(run().status, 0);
    for (const copy of COPIES) assert.equal(fs.readFileSync(path.join(root, copy), 'utf8'), '{"v":1}\n');
});
