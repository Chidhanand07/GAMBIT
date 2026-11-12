/** @jest-environment node */
/**
 * SUPABASE-KEYS (SEC-01, SEC-05, NX-06): the app accepts Supabase's new
 * publishable / secret keys under their documented names and still works with
 * the legacy anon / service_role names. A secret key can never reach the browser.
 */
import fs from 'fs'
import path from 'path'
import pkg from '../../package.json'

jest.mock('next/headers', () => require('../helpers/routeHarness').nextHeadersMock)
jest.mock('@supabase/supabase-js', () => require('../helpers/routeHarness').supabaseJsMock)
jest.mock('@supabase/ssr', () => ({
    ...require('../helpers/routeHarness').supabaseSsrMock,
    createBrowserClient: jest.fn(() => ({})),
}))

import { supabaseSecretKey, supabaseSecretKeySource } from '@/lib/server/env'
import { createAdminClient, createSessionClient } from '@/lib/server/supabase'
import { supabasePublicKey } from '@/lib/supabase/publicEnv'
import { cookieStore, supabaseJsMock, supabaseSsrMock } from '../helpers/routeHarness'

const KEYS = [
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SECRET_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SERVICE_KEY',
]
const saved: Record<string, string | undefined> = {}
beforeEach(() => {
    for (const k of KEYS) {
        saved[k] = process.env[k]
        delete process.env[k]
    }
    jest.clearAllMocks()
})
afterEach(() => {
    for (const k of KEYS) {
        if (saved[k] === undefined) delete process.env[k]
        else process.env[k] = saved[k]
    }
})

describe('public (browser-safe) key', () => {
    test('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY wins over the legacy anon key', () => {
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'legacy-anon'
        expect(supabasePublicKey()).toBe('legacy-anon')
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_new'
        expect(supabasePublicKey()).toBe('sb_publishable_new')
    })

    test('neither set → undefined (callers fail fast)', () => {
        expect(supabasePublicKey()).toBeUndefined()
    })

    test('a secret key in a public variable is refused, whichever name it is under', () => {
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_secret_oops'
        expect(() => supabasePublicKey()).toThrow(/secret key/i)
        delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'sb_secret_oops'
        expect(() => supabasePublicKey()).toThrow(/secret key/i)
    })

    test('the session client (identity checks) uses the public key, never the secret one', () => {
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_new'
        process.env.SUPABASE_SECRET_KEY = 'sb_secret_new'
        createSessionClient(cookieStore as never)
        expect(supabaseSsrMock.createServerClient.mock.calls.at(-1)).toEqual(
            expect.arrayContaining(['https://testref.supabase.co', 'sb_publishable_new']),
        )
    })
})

describe('secret (server-only) key', () => {
    test.each([
        [{ SUPABASE_SECRET_KEY: 'sb_secret_new', SUPABASE_SERVICE_ROLE_KEY: 'role', SUPABASE_SERVICE_KEY: 'svc' }, 'sb_secret_new', 'SUPABASE_SECRET_KEY'],
        [{ SUPABASE_SERVICE_ROLE_KEY: 'role', SUPABASE_SERVICE_KEY: 'svc' }, 'role', 'SUPABASE_SERVICE_ROLE_KEY'],
        [{ SUPABASE_SERVICE_KEY: 'svc' }, 'svc', 'SUPABASE_SERVICE_KEY'],
    ])('%j → %s (from %s)', (env, key, source) => {
        Object.assign(process.env, env)
        expect(supabaseSecretKey()).toBe(key)
        expect(supabaseSecretKeySource()).toBe(source)
    })

    test('none set → undefined', () => {
        expect(supabaseSecretKey()).toBeUndefined()
        expect(supabaseSecretKeySource()).toBeNull()
    })

    test('the admin client is built with the secret key', () => {
        process.env.SUPABASE_SECRET_KEY = 'sb_secret_new'
        createAdminClient()
        expect(supabaseJsMock.createClient.mock.calls.at(-1)?.slice(0, 2)).toEqual([
            'https://testref.supabase.co',
            'sb_secret_new',
        ])
    })

    test('with no secret key the admin client is refused (no silent anonymous client)', () => {
        expect(() => createAdminClient()).toThrow(/SUPABASE_SECRET_KEY/)
    })
})

describe('secret keys cannot reach the browser bundle', () => {
    const ROOT = path.resolve(__dirname, '..', '..')
    const SERVER_ONLY_DIRS = ['lib/server', 'app/api', 'app/auth/callback']
    const SECRET_NAMES = /SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SERVICE_KEY|ENGINE_SHARED_SECRET/

    function sourceFiles(dir: string): string[] {
        return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) return sourceFiles(full)
            return /\.(ts|tsx)$/.test(entry.name) ? [full] : []
        })
    }

    test('no file outside the server-only folders mentions a secret variable', () => {
        const offenders = ['app', 'components', 'features', 'lib', 'types']
            .flatMap((d) => sourceFiles(path.join(ROOT, d)))
            .map((f) => path.relative(ROOT, f))
            .filter((f) => !SERVER_ONLY_DIRS.some((d) => f.startsWith(d)))
            .filter((f) => SECRET_NAMES.test(fs.readFileSync(path.join(ROOT, f), 'utf8')))
        expect(offenders).toEqual([])
    })

    test('every lib/server module is marked server-only', () => {
        const unmarked = sourceFiles(path.join(ROOT, 'lib/server'))
            .filter((f) => !fs.readFileSync(f, 'utf8').includes("import 'server-only'"))
            .map((f) => path.relative(ROOT, f))
        expect(unmarked).toEqual([])
    })

    test('no secret is exposed through a NEXT_PUBLIC_ variable name anywhere in the source', () => {
        const all = ['app', 'components', 'features', 'lib', 'types', 'proxy.ts'].flatMap((d) => {
            const full = path.join(ROOT, d)
            return fs.statSync(full).isDirectory() ? sourceFiles(full) : [full]
        })
        const bad = all.filter((f) => /NEXT_PUBLIC_[A-Z_]*(SECRET|SERVICE)/.test(fs.readFileSync(f, 'utf8')))
        expect(bad.map((f) => path.relative(ROOT, f))).toEqual([])
    })
})

describe('client library versions', () => {
    const parse = (v: string) => v.replace(/^[^\d]*/, '').split('.').map(Number)

    test('@supabase/supabase-js is on the current 2.x line (the Node 20 pin is gone) [NODE-RUNTIME]', () => {
        const [major, minor] = parse(pkg.dependencies['@supabase/supabase-js'])
        expect(major).toBe(2)
        // 2.110+ need Node 22; the runtimes are on Node 26 now, so the newest line is used.
        expect(minor).toBeGreaterThanOrEqual(119)
    })

    test('@supabase/ssr has the getAll/setAll cookie API', () => {
        const [major, minor] = parse(pkg.dependencies['@supabase/ssr'])
        expect([major, minor >= 5]).toEqual([0, true])
    })
})
