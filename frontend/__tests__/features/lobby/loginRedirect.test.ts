import { loginHref } from '@/features/lobby/loginRedirect'
import { safeRedirectPath } from '@/lib/safeRedirect'

describe('loginHref [F10]', () => {
    test('carries the return path in the `redirect` parameter the login page reads', () => {
        const href = loginHref('/lobby')
        expect(href).toBe('/login?redirect=%2Flobby')
        const back = new URL(href, 'http://x.test').searchParams.get('redirect')
        expect(safeRedirectPath(back)).toBe('/lobby')
    })

    test('an off-site return path is replaced by the default destination', () => {
        expect(loginHref('//evil.example')).toBe('/login?redirect=%2Flobby')
        expect(loginHref('/game/g1?x=1')).toBe('/login?redirect=%2Fgame%2Fg1%3Fx%3D1')
    })
})
