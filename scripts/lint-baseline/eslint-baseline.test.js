'use strict';

// Run with: node --test scripts/lint-baseline/eslint-baseline.test.js   (Node built-ins only)

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const { baselineBlock, readBaseline } = require('./eslint-baseline');

function packageWith(files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-baseline-'));
    if (files) fs.writeFileSync(path.join(dir, '.lint-baseline.json'), JSON.stringify({ files }));
    return dir;
}

test('glob syntax in baselined paths is escaped, including the backslash itself (CodeQL js/incomplete-sanitization)', () => {
    const dir = packageWith({ 'app/game/[id]/page.tsx': 10, 'odd\\name.ts': 5 });
    const [block] = baselineBlock(dir, [{ rules: { complexity: ['error', 10] } }]);
    assert.deepEqual(block.files, ['app/game/\\[id\\]/page.tsx', 'odd\\\\name.ts']);
    assert.deepEqual(block.rules, { complexity: ['warn', 10] });
});

test('a package without a baseline file has no baseline (no exists-then-read race)', () => {
    assert.deepEqual(readBaseline(packageWith(null)), {});
    assert.deepEqual(baselineBlock(packageWith(null), []), []);
});
