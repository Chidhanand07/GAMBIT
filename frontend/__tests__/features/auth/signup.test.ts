/**
 * features/auth/signup.ts [S14] (SEC-01): the browser sign-up flow writes nothing to the
 * console. It used to log the e-mail address, the session expiry and the auth cookie names.
 */
const signInWithPassword = jest.fn()
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signInWithPassword } }) }))

import { registerAndSignIn } from '@/features/auth/signup'

const INPUT = { email: 'secret.person@example.test', password: 'longenough', username: 'new_user' }
const SESSION_EXPIRY = 1893456000
const AUTH_COOKIE = 'sb-testref-auth-token'
const CONSOLE_METHODS = ['log', 'info', 'debug', 'warn', 'error', 'trace', 'dir', 'table'] as const

let spies: Record<(typeof CONSOLE_METHODS)[number], jest.SpyInstance>
let fetchMock: jest.Mock

/** Every console call made by the app code. jsdom reports the unimplemented page load of
 *  `location.assign` through console.error; that one message is jsdom's, not the app's. */
function appConsoleCalls(): unknown[][] {
    return CONSOLE_METHODS.flatMap((method) => spies[method].mock.calls).filter(
        (args) => !String((args[0] as { message?: string })?.message ?? args[0]).includes('Not implemented: navigation'),
    )
}

beforeEach(() => {
    spies = Object.fromEntries(
        CONSOLE_METHODS.map((method) => [method, jest.spyOn(console, method).mockImplementation(() => {})]),
    ) as typeof spies
    fetchMock = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }))
    ;(global as unknown as { fetch: jest.Mock }).fetch = fetchMock
    document.cookie = `${AUTH_COOKIE}=cookie-value`
    signInWithPassword.mockReset()
})
afterEach(() => jest.restoreAllMocks())

describe('registerAndSignIn logs nothing [S14]', () => {
    test('successful sign-up and sign-in: no console output, so no e-mail, session expiry or cookie name', async () => {
        signInWithPassword.mockResolvedValue({
            data: { user: { email: INPUT.email }, session: { expires_at: SESSION_EXPIRY } },
            error: null,
        })
        expect(await registerAndSignIn(INPUT)).toBeNull()
        expect(signInWithPassword).toHaveBeenCalledWith({ email: INPUT.email, password: INPUT.password })
        expect(appConsoleCalls()).toEqual([])
        const everything = JSON.stringify(CONSOLE_METHODS.flatMap((method) => spies[method].mock.calls.map(String)))
        expect(everything).not.toContain(INPUT.email)
        expect(everything).not.toContain(String(SESSION_EXPIRY))
        expect(everything).not.toContain(AUTH_COOKIE)
    })

    test('the API refuses the sign-up: the message is returned, nothing is logged', async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'Email taken' }) })
        expect(await registerAndSignIn(INPUT)).toBe('Email taken')
        expect(appConsoleCalls()).toEqual([])
    })

    test('sign-in after sign-up fails: the message is returned, nothing is logged', async () => {
        signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: { message: 'nope' } })
        expect(await registerAndSignIn(INPUT)).toBe('Account created! Please sign in.')
        expect(appConsoleCalls()).toEqual([])
    })

    test('no session after sign-in (e-mail confirmation): the message is returned, nothing is logged', async () => {
        signInWithPassword.mockResolvedValue({ data: { user: { email: INPUT.email }, session: null }, error: null })
        expect(await registerAndSignIn(INPUT)).toBe('Account created! Please confirm your email then sign in.')
        expect(appConsoleCalls()).toEqual([])
    })
})
