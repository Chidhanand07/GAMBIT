/**
 * server/src/config/env.js — every accessor reads process.env at call time.
 */
const env = require('../../src/config/env');

const KEYS = [
    'GAMBIT_ENGINE_URL',
    'ENGINE_URL',
    'ENGINE_SHARED_SECRET',
    'NODE_ENV',
    'FRONTEND_URL',
    'CORS_ORIGINS',
    'CORS_PREVIEW_ORIGIN_REGEX',
    'PORT',
    'REDIS_URL',
    'SUPABASE_URL',
    'SUPABASE_SECRET_KEY',
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
    // Outside production without configuration: the local development origins only [S13].
    expect(env.corsOrigins()).toEqual(['http://localhost:3000', 'http://127.0.0.1:3000']);
    expect(env.corsPreviewPattern()).toBeUndefined();
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
    // FRONTEND_URL is the legacy one-origin fallback for CORS_ORIGINS.
    expect(env.corsOrigins()).toEqual(['https://app.example', 'http://localhost:3000', 'http://127.0.0.1:3000']);
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

test('secret key: SUPABASE_SECRET_KEY, then SUPABASE_SERVICE_KEY, then SUPABASE_SERVICE_ROLE_KEY [SUPABASE-KEYS]', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'role';
    expect(env.supabaseServiceKey()).toBe('role');
    expect(env.supabaseServiceKeySource()).toBe('SUPABASE_SERVICE_ROLE_KEY');
    process.env.SUPABASE_SERVICE_KEY = 'service';
    expect(env.supabaseServiceKey()).toBe('service');
    expect(env.supabaseServiceKeySource()).toBe('SUPABASE_SERVICE_KEY');
    // The new key name wins over both legacy names.
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_new';
    expect(env.supabaseServiceKey()).toBe('sb_secret_new');
    expect(env.supabaseServiceKeySource()).toBe('SUPABASE_SECRET_KEY');
});

test('an empty SUPABASE_SECRET_KEY falls through to the legacy names', () => {
    process.env.SUPABASE_SECRET_KEY = '';
    process.env.SUPABASE_SERVICE_KEY = 'service';
    expect(env.supabaseServiceKey()).toBe('service');
    expect(env.supabaseServiceKeySource()).toBe('SUPABASE_SERVICE_KEY');
});

describe('engine URL [G5]', () => {
    // A fresh module per test: the "warn once" memory is module state.
    let env;
    let warn;
    beforeEach(() => {
        jest.isolateModules(() => {
            env = require('../../src/config/env');
            // Warnings go through the structured logger (NODE-20) of the same fresh module set.
            warn = jest.spyOn(require('../../src/observability/log').log, 'warn');
        });
    });
    afterEach(() => warn.mockRestore());

    test('GAMBIT_ENGINE_URL is the canonical name and wins over ENGINE_URL', () => {
        process.env.GAMBIT_ENGINE_URL = 'http://canonical.test:8001';
        process.env.ENGINE_URL = 'http://legacy.test:8001';
        expect(env.engineUrl()).toBe('http://canonical.test:8001');
        expect(warn).not.toHaveBeenCalled();
    });

    test('ENGINE_URL still works as a fallback and warns once', () => {
        process.env.ENGINE_URL = 'http://legacy.test:8001';
        expect(env.engineUrl()).toBe('http://legacy.test:8001');
        expect(env.engineUrl()).toBe('http://legacy.test:8001');
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toMatch(/ENGINE_URL is deprecated.*GAMBIT_ENGINE_URL/);
    });

    test('neither set in production: default URL plus one warning', () => {
        process.env.NODE_ENV = 'production';
        expect(env.engineUrl()).toBe('http://localhost:8001');
        expect(env.engineUrl()).toBe('http://localhost:8001');
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toMatch(/GAMBIT_ENGINE_URL is not set/);
    });

    test('neither set outside production: default URL, no warning', () => {
        process.env.NODE_ENV = 'test';
        expect(env.engineUrl()).toBe('http://localhost:8001');
        expect(warn).not.toHaveBeenCalled();
    });
});

describe('engine shared secret [ENG-AUTH]', () => {
    let env;
    let warn;
    beforeEach(() => {
        jest.isolateModules(() => {
            env = require('../../src/config/env');
            // Warnings go through the structured logger (NODE-20) of the same fresh module set.
            warn = jest.spyOn(require('../../src/observability/log').log, 'warn');
        });
    });
    afterEach(() => warn.mockRestore());

    test('reads ENGINE_SHARED_SECRET at call time', () => {
        expect(env.engineSharedSecret()).toBeUndefined();
        process.env.ENGINE_SHARED_SECRET = 's3cret';
        expect(env.engineSharedSecret()).toBe('s3cret');
        expect(warn).not.toHaveBeenCalled();
    });

    test('warns once in production when it is missing, and never logs a value', () => {
        process.env.NODE_ENV = 'production';
        env.engineSharedSecret();
        env.engineSharedSecret();
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][0]).toMatch(/ENGINE_SHARED_SECRET is not set/);
    });
});

test('the config object is frozen', () => {
    expect(Object.isFrozen(env)).toBe(true);
});

describe('CORS_ORIGINS [S13]', () => {
    test('CORS_ORIGINS wins over FRONTEND_URL', () => {
        process.env.CORS_ORIGINS = 'https://a.example, https://b.example';
        process.env.FRONTEND_URL = 'https://legacy.example';
        expect(env.corsOrigins()).toEqual(['https://a.example', 'https://b.example', 'http://localhost:3000', 'http://127.0.0.1:3000']);
        delete process.env.CORS_ORIGINS;
    });

    test('production: only the configured origins, no localhost', () => {
        process.env.NODE_ENV = 'production';
        process.env.CORS_ORIGINS = 'https://gambit.app';
        expect(env.corsOrigins()).toEqual(['https://gambit.app']);
        delete process.env.CORS_ORIGINS;
        process.env.NODE_ENV = 'test';
    });

    test('production without any configured origin fails fast', () => {
        process.env.NODE_ENV = 'production';
        delete process.env.CORS_ORIGINS;
        delete process.env.FRONTEND_URL;
        expect(() => env.corsOrigins()).toThrow('CORS_ORIGINS is required in production');
        process.env.NODE_ENV = 'test';
    });
});
