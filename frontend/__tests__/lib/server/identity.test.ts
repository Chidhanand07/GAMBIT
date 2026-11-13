/** @jest-environment node */
/**
 * lib/server/identity.ts [S5]. This file used to pin the two unverified cookie
 * decoders (`getUserId`, `getUserIdSkippingEmptyCookie`) and the cookie shapes
 * they accepted. Both are gone: the same cookie shapes are replayed here to show
 * that NONE of them yields an identity unless Supabase Auth confirms the user.
 */
jest.mock('next/headers', () => require('../../helpers/routeHarness').nextHeadersMock)
jest.mock('@supabase/supabase-js', () => require('../../helpers/routeHarness').supabaseJsMock)
jest.mock('@supabase/ssr', () => require('../../helpers/routeHarness').supabaseSsrMock)

import * as identity from '@/lib/server/identity'
import { getVerifiedUserId } from '@/lib/server/identity'
import { AUTH_COOKIE, db, resetHarness, sessionCookie, setRawCookie } from '../../helpers/routeHarness'

beforeEach(() => {
    resetHarness()
    jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

const COOKIE_SHAPES: Array<[string, Record<string, string>]> = [
    ['single cookie', { [AUTH_COOKIE]: sessionCookie('u1') }],
    ['URI-encoded cookie', { [AUTH_COOKIE]: encodeURIComponent(sessionCookie('u1')) }],
    ['chunked cookie', { [`${AUTH_COOKIE}.0`]: sessionCookie('u1').slice(0, 20), [`${AUTH_COOKIE}.1`]: sessionCookie('u1').slice(20) }],
    ['expired 30 s ago', { [AUTH_COOKIE]: sessionCookie('u1', -30) }],
    ['empty base cookie next to a chunk', { [AUTH_COOKIE]: '', [`${AUTH_COOKIE}.0`]: sessionCookie('u1') }],
]

describe('the cookie alone is never an identity', () => {
    test.each(COOKIE_SHAPES)('%s → null while Supabase Auth has not confirmed a user', async (_label, cookies) => {
        for (const [name, value] of Object.entries(cookies)) setRawCookie(name, value)
        expect(await getVerifiedUserId()).toBeNull()
    })

    test.each(COOKIE_SHAPES)('%s → the id Supabase Auth returns, not the one in the cookie', async (_label, cookies) => {
        for (const [name, value] of Object.entries(cookies)) setRawCookie(name, value)
        db.signIn('verified-user')
        expect(await getVerifiedUserId()).toBe('verified-user')
    })
})

test('the unverified decoders no longer exist', () => {
    expect(identity).not.toHaveProperty('getUserId')
    expect(identity).not.toHaveProperty('getUserIdSkippingEmptyCookie')
    expect(identity).not.toHaveProperty('getSessionUser')
})

test('a failing Auth lookup is logged and treated as signed out', async () => {
    db.auth.getUser.mockRejectedValue(new Error('fetch failed'))
    expect(await getVerifiedUserId()).toBeNull()
    expect(console.error).toHaveBeenCalledWith('[identity] could not verify the session:', 'fetch failed')
})
