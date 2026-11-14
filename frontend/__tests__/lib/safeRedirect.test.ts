/**
 * lib/safeRedirect.ts [S6]: a post-sign-in destination taken from a query parameter is
 * followed only when it is a path on this site. Everything else falls back to /lobby.
 */
import { DEFAULT_REDIRECT_PATH, safeRedirectPath } from '@/lib/safeRedirect'

const ORIGIN = 'https://gambit.example'
/** Where a browser (or `new URL(next, request.url)`) would actually end up. */
const landsOn = (path: string) => new URL(path, `${ORIGIN}/auth/callback`).origin

describe('safeRedirectPath', () => {
    test('the default destination is /lobby', () => {
        expect(DEFAULT_REDIRECT_PATH).toBe('/lobby')
    })

    test.each([
        ['/lobby'],
        ['/'],
        ['/join/tok_123'],
        ['/challenge/some_user'],
        ['/profile/x?tab=games'],
        ['/game/abc?x=1&y=2#board'],
        ['/analysis#move-12'],
        ['/search?q=a%2Fb'],
        ['/a/b/c/'],
        ['/login?redirect=%2Flobby'],
        ['/path?next=https://evil.example'],
        ['/@handle'],
    ])('keeps the same-origin path %s', (path) => {
        expect(safeRedirectPath(path)).toBe(path)
        expect(landsOn(safeRedirectPath(path))).toBe(ORIGIN)
    })

    test.each([
        ['absolute https URL', 'https://evil.example'],
        ['absolute https URL with a path', 'https://evil.example/lobby'],
        ['absolute http URL', 'http://evil.example'],
        ['upper-case scheme', 'HTTPS://evil.example'],
        ['scheme without slashes', 'https:evil.example'],
        ['javascript: URL', 'javascript:alert(1)'],
        ['data: URL', 'data:text/html,<script>alert(1)</script>'],
        ['mailto: URL', 'mailto:a@b.c'],
        ['protocol-relative URL', '//evil.example'],
        ['protocol-relative URL with a path', '//evil.example/lobby'],
        ['three slashes', '///evil.example'],
        ['slash-backslash host', '/\\evil.example'],
        ['backslash-backslash host', '\\\\evil.example'],
        ['backslash-slash host', '\\/evil.example'],
        ['backslash later in the path', '/lobby\\..\\evil'],
        ['backslash in the query', '/lobby?x=\\evil'],
        ['tab hiding a second slash', '/\t/evil.example'],
        ['newline hiding a second slash', '/\n/evil.example'],
        ['carriage return hiding a second slash', '/\r/evil.example'],
        ['tab inside the path', '/lob\tby'],
        ['NUL byte', '/lobby\u0000'],
        ['escape character', '/lobby\u001b[0m'],
        ['DEL character', '/lobby\u007f'],
        ['C1 control character', '/lobby\u0085'],
        ['CRLF header injection', '/lobby\r\nSet-Cookie: a=b'],
        ['leading space', ' /lobby'],
        ['leading tab before a URL', '\thttps://evil.example'],
        ['relative path without a slash', 'lobby'],
        ['dot-relative path', './lobby'],
        ['parent-relative path', '../lobby'],
        ['bare host', 'evil.example'],
        ['userinfo trick', '@evil.example'],
        ['query only', '?next=/lobby'],
        ['fragment only', '#lobby'],
        ['empty string', ''],
        ['dot segment that normalises to //host', '/.//evil.example'],
        ['parent segment that normalises to //host', '/..//evil.example'],
        ['nested dot segments that normalise to //host', '/a/..//evil.example'],
        ['encoded dot segment that normalises to //host', '/%2e//evil.example'],
    ])('rejects %s', (_name, value) => {
        expect(safeRedirectPath(value)).toBe('/lobby')
    })

    test.each([[null], [undefined]])('a missing value (%s) falls back to /lobby', (value) => {
        expect(safeRedirectPath(value)).toBe('/lobby')
    })

    test('the fallback can be chosen by the caller', () => {
        expect(safeRedirectPath('https://evil.example', '/login')).toBe('/login')
        expect(safeRedirectPath('/join/tok', '/login')).toBe('/join/tok')
    })

    test('dot segments inside the site are resolved, so the result is the path that is followed', () => {
        expect(safeRedirectPath('/a/../lobby')).toBe('/lobby')
        expect(safeRedirectPath('/a/./b')).toBe('/a/b')
    })

    test('an encoded slash or backslash stays an ordinary path segment on this site', () => {
        for (const path of ['/%2F%2Fevil.example', '/%5Cevil.example', '/%2f/evil.example']) {
            expect(safeRedirectPath(path)).toBe(path)
            expect(landsOn(path)).toBe(ORIGIN)
        }
    })

    test('whatever comes back always resolves to this origin', () => {
        const hostile = ['https://evil.example', '//evil.example', '/\\evil.example', '/\t/evil.example', '/.//evil.example', 'javascript:alert(1)']
        for (const value of hostile) expect(landsOn(safeRedirectPath(value))).toBe(ORIGIN)
    })
})
