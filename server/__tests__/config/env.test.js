/**
 * server/src/config/env.js — every accessor reads process.env at call time.
 */
const env = require('../../src/config/env');

const KEYS = [
    'ENGINE_URL',
    'FRONTEND_URL',
    'PORT',
    'REDIS_URL',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
];
const saved = {};

beforeEach(() => {
    for (const k of KEYS) {
        saved[k] = process.env[k];
        delete process.env[k];
    }
});
afterEach(() => {
    for (const k of KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
    }
});

test('defaults match the pre-refactor literals', () => {
    expect(env.engineUrl()).toBe('http://localhost:8001');
    expect(env.frontendUrl()).toBeUndefined();
    expect(env.port()).toBe(3001);
    expect(env.redisUrl()).toBe('redis://127.0.0.1:6379');
    expect(env.supabaseUrl()).toBeUndefined();
    expect(env.supabaseServiceKey()).toBeUndefined();
    expect(env.supabaseServiceKeySource()).toBe('SUPABASE_SERVICE_ROLE_KEY');
});

test('values are read when called, not when the module loaded', () => {
    process.env.ENGINE_URL = 'http://engine.test:9000';
    process.env.FRONTEND_URL = 'https://app.example';
    process.env.PORT = '4000';
    process.env.REDIS_URL = 'redis://r:1';
    process.env.SUPABASE_URL = 'https://x.supabase.co';
    expect(env.engineUrl()).toBe('http://engine.test:9000');
    expect(env.frontendUrl()).toBe('https://app.example');
    expect(env.port()).toBe('4000');
    expect(env.redisUrl()).toBe('redis://r:1');
    expect(env.supabaseUrl()).toBe('https://x.supabase.co');
});

test('empty strings fall back to the defaults (|| semantics)', () => {
    process.env.ENGINE_URL = '';
    process.env.PORT = '';
    expect(env.engineUrl()).toBe('http://localhost:8001');
    expect(env.port()).toBe(3001);
});

test('service key prefers SUPABASE_SERVICE_KEY over SUPABASE_SERVICE_ROLE_KEY', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'role';
    expect(env.supabaseServiceKey()).toBe('role');
    expect(env.supabaseServiceKeySource()).toBe('SUPABASE_SERVICE_ROLE_KEY');
    process.env.SUPABASE_SERVICE_KEY = 'service';
    expect(env.supabaseServiceKey()).toBe('service');
    expect(env.supabaseServiceKeySource()).toBe('SUPABASE_SERVICE_KEY');
});

test('the config object is frozen', () => {
    expect(Object.isFrozen(env)).toBe(true);
});
