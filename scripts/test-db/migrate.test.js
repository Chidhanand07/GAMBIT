'use strict';

// Run with: node --test scripts/test-db/*.test.js   (Node built-ins only)

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { pushArgs } = require('./migrate');

test('pushes every migration to the given database URL without prompting', () => {
    const args = pushArgs('postgresql://u:p@host:5432/postgres', false);
    assert.deepEqual(args.slice(0, 5), ['db', 'push', '--remote=postgresql://u:p@host:5432/postgres', '--include-all', '--yes']);
    assert.ok(!args.includes('--dry-run'));
    assert.ok(pushArgs('postgresql://x', true).includes('--dry-run'));
});
