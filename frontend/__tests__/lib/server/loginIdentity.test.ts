/** @jest-environment node */
/**
 * lib/server/loginIdentity.ts [F-101]: "Email or username" sign-in resolves a username to its
 * account's e-mail on the server; unknown names do the same work, and every failure is padded
 * to one timing class.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
    FAILED_LOGIN_MIN_MS,
    isEmailIdentifier,
    resolveLoginEmail,
    unknownAccountEmail,
    waitForFailureFloor,
} from '@/lib/server/loginIdentity'
import { createSupabaseMock } from '../../helpers/supabaseMock'

const ID = '00000000-0000-4000-8000-000000000001'
let db: ReturnType<typeof createSupabaseMock>
const admin = () => db as unknown as SupabaseClient

beforeEach(() => {
    db = createSupabaseMock()
})

describe('isEmailIdentifier', () => {
    test('anything with @ is an e-mail (usernames cannot contain one)', () => {
        expect(isEmailIdentifier('a@b.c')).toBe(true)
        expect(isEmailIdentifier('magnus_c')).toBe(false)
    })
})

describe('unknownAccountEmail', () => {
    test('a fresh address under the reserved .invalid TLD every time', () => {
        const a = unknownAccountEmail()
        expect(a).toMatch(/^[0-9a-f-]{36}@login\.invalid$/)
        expect(unknownAccountEmail()).not.toBe(a)
    })
})

describe('resolveLoginEmail', () => {
    test('an e-mail is returned as typed, without any lookup', async () => {
        expect(await resolveLoginEmail(admin(), 'A@B.c')).toBe('A@B.c')
        expect(db.from).not.toHaveBeenCalled()
        expect(db.auth.admin.getUserById).not.toHaveBeenCalled()
    })

    test('a username: profiles by case-insensitive exact match, then the auth user e-mail', async () => {
        db.queue('profiles', { data: [{ id: ID, username: 'Magnus_C' }], error: null })
        db.auth.admin.getUserById.mockResolvedValue({ data: { user: { id: ID, email: 'm@x.io' } }, error: null } as any)
        expect(await resolveLoginEmail(admin(), 'MAGNUS_C')).toBe('m@x.io')
        const [call] = db.callsFor('profiles')
        expect(call.ops).toEqual([['select', 'id, username'], ['ilike', 'username', 'MAGNUS\\_C'], ['limit', 2]])
        expect(db.auth.admin.getUserById).toHaveBeenCalledWith(ID)
    })

    test('unknown username: null, after the same admin round trip (a random id)', async () => {
        db.queue('profiles', { data: [], error: null })
        expect(await resolveLoginEmail(admin(), 'nobody')).toBeNull()
        expect(db.auth.admin.getUserById).toHaveBeenCalledTimes(1)
        expect(db.auth.admin.getUserById.mock.calls[0]).not.toContain(ID)
    })

    test('a found profile whose auth user lookup fails is unknown', async () => {
        db.queue('profiles', { data: [{ id: ID, username: 'x_y' }], error: null })
        db.auth.admin.getUserById.mockResolvedValue({ data: { user: null }, error: { message: 'nope' } } as any)
        expect(await resolveLoginEmail(admin(), 'x_y')).toBeNull()
    })

    test('several case variants and none spelled exactly: unknown (never a guess)', async () => {
        db.queue('profiles', { data: [{ id: ID, username: 'bob' }, { id: 'other', username: 'Bob' }], error: null })
        expect(await resolveLoginEmail(admin(), 'BOB')).toBeNull()
    })

    test('a name the username rule rejects is unknown without a profile query', async () => {
        expect(await resolveLoginEmail(admin(), 'has space')).toBeNull()
        expect(await resolveLoginEmail(admin(), 'wild%card')).toBeNull()
        expect(db.callsFor('profiles')).toHaveLength(0)
        expect(db.auth.admin.getUserById).toHaveBeenCalledTimes(2)
    })
})

describe('waitForFailureFloor', () => {
    afterEach(() => jest.useRealTimers())

    test('waits out the rest of the floor, measured from the start', async () => {
        jest.useFakeTimers({ now: 10_000 })
        let done = false
        const started = Date.now() - 300
        void waitForFailureFloor(started).then(() => { done = true })
        await jest.advanceTimersByTimeAsync(FAILED_LOGIN_MIN_MS - 301)
        expect(done).toBe(false)
        await jest.advanceTimersByTimeAsync(1)
        expect(done).toBe(true)
    })

    test('returns at once when the floor has already passed', async () => {
        jest.useFakeTimers({ now: 10_000 })
        let done = false
        void waitForFailureFloor(Date.now() - FAILED_LOGIN_MIN_MS - 5).then(() => { done = true })
        await jest.advanceTimersByTimeAsync(0)
        expect(done).toBe(true)
    })
})
