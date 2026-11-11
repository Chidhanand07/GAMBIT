/** @jest-environment node */
/**
 * The two cookie-identity variants kept separate in lib/server/identity.ts
 * (docs/refactor/adr/0202-route-identity-variants.md). They agree on every input
 * except a present-but-empty base cookie next to chunk cookies.
 */
import { getUserId, getUserIdSkippingEmptyCookie } from '@/lib/server/identity'
import { AUTH_COOKIE, sessionCookie } from '../../helpers/routeHarness'

function store(entries: Record<string, string>) {
    return { get: (name: string) => (name in entries ? { name, value: entries[name] } : undefined) } as never
}

describe('cookie identity variants', () => {
    test.each([
        ['single cookie', { [AUTH_COOKIE]: sessionCookie('u1') }, 'u1'],
        ['URI-encoded cookie', { [AUTH_COOKIE]: encodeURIComponent(sessionCookie('u1')) }, 'u1'],
        ['chunked cookie', { [`${AUTH_COOKIE}.0`]: sessionCookie('u1').slice(0, 20), [`${AUTH_COOKIE}.1`]: sessionCookie('u1').slice(20) }, 'u1'],
        ['expired 30 s ago (60 s leeway)', { [AUTH_COOKIE]: sessionCookie('u1', -30) }, 'u1'],
        ['expired 2 min ago', { [AUTH_COOKIE]: sessionCookie('u1', -120) }, null],
        ['JSON null payload', { [AUTH_COOKIE]: JSON.stringify({ access_token: `a.${Buffer.from('null').toString('base64')}.c` }) }, null],
        ['no cookie', {}, null],
    ])('%s → both variants agree', (_label, cookies, expected) => {
        expect(getUserId(store(cookies))).toBe(expected)
        expect(getUserIdSkippingEmptyCookie(store(cookies))).toBe(expected)
    })

    test('an empty base cookie hides the chunks for getUserId but not for the /api/profile/me variant', () => {
        const value = sessionCookie('u1')
        const cookies = { [AUTH_COOKIE]: '', [`${AUTH_COOKIE}.0`]: value }
        expect(getUserId(store(cookies))).toBeNull()
        expect(getUserIdSkippingEmptyCookie(store(cookies))).toBe('u1')
    })
})
