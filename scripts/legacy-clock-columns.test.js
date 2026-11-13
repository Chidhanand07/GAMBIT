'use strict';

// Run with: node --test scripts/legacy-clock-columns.test.js   (Node built-ins only)
// The legacy games.white_time_ms / black_time_ms columns [SCHEMA-CLEANUP] (ADR F-070, SEC-08):
// a migration drops them, and no code, SQL function, policy or view still names them.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const ROOT = path.join(__dirname, '..');
const MIGRATIONS = path.join(ROOT, 'supabase', 'migrations');
const LEGACY = /\b(white|black)_time_ms\b/;
const SOURCE_DIRS = ['server/src', 'server/lib', 'server/services', 'frontend/app', 'frontend/lib', 'frontend/features',
    'frontend/components', 'frontend/types', 'frontend/hooks', 'chess-engine'];
const SOURCE_FILES = /\.(js|cjs|mjs|ts|tsx|py|sql)$/;
const SKIP_DIRS = new Set(['node_modules', '.next', '__tests__', 'tests', '__pycache__', '.venv', 'venv']);

/** Every source file under `dir` (relative to the repo root), tests and dependencies excluded. */
function sourceFiles(dir) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) return [];
    return fs.readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
        if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : sourceFiles(path.join(dir, entry.name));
        return SOURCE_FILES.test(entry.name) ? [path.join(dir, entry.name)] : [];
    });
}

/** SQL without `--` comments, so a comment that mentions a column does not count. */
const stripComments = (sql) => sql.replace(/--.*$/gm, '');

const migrations = () => fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();

test('a migration after rating_atomic drops both legacy clock columns', () => {
    const drops = migrations().filter((file) => {
        const sql = stripComments(fs.readFileSync(path.join(MIGRATIONS, file), 'utf8'));
        return /drop\s+column\s+if\s+exists\s+white_time_ms/i.test(sql) && /drop\s+column\s+if\s+exists\s+black_time_ms/i.test(sql);
    });
    assert.equal(drops.length, 1, 'exactly one migration drops white_time_ms and black_time_ms');
    assert.ok(drops[0] > '20261113100000', `${drops[0]} must sort after 20261113100000_rating_atomic.sql`);
});

test('no migration after the drop names the legacy columns again', () => {
    const files = migrations();
    const dropIndex = files.findIndex((f) => /drop_legacy_clock_columns/.test(f));
    assert.ok(dropIndex >= 0);
    for (const file of files.slice(dropIndex + 1)) {
        const sql = stripComments(fs.readFileSync(path.join(MIGRATIONS, file), 'utf8'));
        assert.doesNotMatch(sql, LEGACY, `${file} names a dropped column`);
    }
});

test('no application code reads or writes the legacy columns', () => {
    const offenders = SOURCE_DIRS.flatMap(sourceFiles).filter((file) =>
        LEGACY.test(fs.readFileSync(path.join(ROOT, file), 'utf8')),
    );
    assert.deepEqual(offenders, []);
});
