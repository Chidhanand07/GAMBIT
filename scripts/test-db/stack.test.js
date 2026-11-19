'use strict';

// Run with: node --test scripts/test-db/*.test.js   (Node built-ins only)

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { ports, serverEnv } = require('./stack');

test('test-project values and the local ports win over the inherited environment', () => {
    const p = ports({});
    assert.deepEqual(p, { web: '3201', server: '3202', redis: '6390' });
    const env = serverEnv(
        { SUPABASE_URL: 'https://testref.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test' },
        p,
        { SUPABASE_URL: 'https://prodref.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_prod', PORT: '3001', REDIS_URL: 'rediss://prod' },
    );
    assert.equal(env.SUPABASE_URL, 'https://testref.supabase.co');
    assert.equal(env.SUPABASE_SECRET_KEY, 'sb_secret_test');
    assert.equal(env.PORT, '3202');
    assert.equal(env.REDIS_URL, 'redis://127.0.0.1:6390');
    assert.equal(env.CORS_ORIGINS, 'http://localhost:3201,http://127.0.0.1:3201');
});
