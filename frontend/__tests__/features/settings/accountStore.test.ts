// SETTINGS-PREFS (ADR F-140): the server-backed SettingsStore and the one-time upload of the
// browser's play preferences.
import { DEFAULT_ACCOUNT_PREFERENCES, parseAccountPreferences, withPreference } from '@/lib/preferences'
import { DEFAULT_SETTINGS } from '@/features/settings/model'
import { createAccountSettingsStore, createLocalSettingsStore, SETTINGS_STORAGE_KEY } from '@/features/settings/store'

const response = (status: number, body: unknown = {}) =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response

function fakeApi(get: Response, patch: Response = response(200, { stored: true, play: {} })) {
    return { get: jest.fn(async () => get), patch: jest.fn(async (_body: object) => patch) }
}

beforeEach(() => localStorage.clear())

describe('createAccountSettingsStore', () => {
    test('signed out (401): play preferences come from localStorage, account preferences are the defaults', async () => {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ boardTheme: 'green' }))
        const api = fakeApi(response(401))
        const store = createAccountSettingsStore({ api })
        const loaded = await store.load()
        expect(loaded.play.boardTheme).toBe('green')
        expect(loaded.account).toEqual(DEFAULT_ACCOUNT_PREFERENCES)
        await store.save({ ...loaded, play: { ...loaded.play, boardTheme: 'slate' } })
        expect(api.patch).not.toHaveBeenCalled()
        expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)!).boardTheme).toBe('slate')
    })

    test('a stored row is parsed defensively; the browser copy is not touched', async () => {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ boardTheme: 'green' }))
        const api = fakeApi(response(200, {
            stored: true,
            play: { boardTheme: 'walnut', pieceAnimation: 'warp' },
            notifications: { challenges: false },
            privacy: { challengePolicy: 'friends', showOnline: 'nope' },
            security: {},
        }))
        const loaded = await createAccountSettingsStore({ api }).load()
        expect(loaded.play).toMatchObject({ boardTheme: 'walnut', pieceAnimation: DEFAULT_SETTINGS.pieceAnimation })
        expect(loaded.account.notifications.challenges).toBe(false)
        expect(loaded.account.privacy).toMatchObject({ challengePolicy: 'friends', showOnline: true })
        expect(api.patch).not.toHaveBeenCalled()
        expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).not.toBeNull()
    })

    test('no server row yet: the browser\'s play preferences are uploaded once, then cleared', async () => {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ boardTheme: 'green', autoQueen: false }))
        const api = fakeApi(response(200, { stored: false }), response(200, { stored: true, play: { boardTheme: 'green', autoQueen: false } }))
        const loaded = await createAccountSettingsStore({ api }).load()
        expect(api.patch).toHaveBeenCalledTimes(1)
        expect(api.patch.mock.calls[0][0]).toEqual({ play: expect.objectContaining({ boardTheme: 'green', autoQueen: false }) })
        expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toBeNull()
        expect(loaded.play).toMatchObject({ boardTheme: 'green', autoQueen: false })
    })

    test('a failed upload keeps the browser copy for the next load and still applies it', async () => {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ boardTheme: 'green' }))
        const api = fakeApi(response(200, { stored: false }), response(500))
        const loaded = await createAccountSettingsStore({ api }).load()
        expect(loaded.play.boardTheme).toBe('green')
        expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).not.toBeNull()
    })

    test('signed in: save PATCHes everything; a failed save rejects', async () => {
        const api = fakeApi(response(200, { stored: true, play: {} }))
        const store = createAccountSettingsStore({ api })
        const loaded = await store.load()
        const next = { ...loaded, account: withPreference(loaded.account, 'privacy', 'allowSpectators', false) }
        await store.save(next)
        expect(api.patch).toHaveBeenLastCalledWith(next)
        api.patch.mockResolvedValueOnce(response(500))
        await expect(store.save(next)).rejects.toThrow('settings save failed: 500')
    })

    test('a server error on load rejects (the provider then keeps privacy features off)', async () => {
        await expect(createAccountSettingsStore({ api: fakeApi(response(500)) }).load()).rejects.toThrow()
    })
})

describe('createLocalSettingsStore.clear', () => {
    test('removes the key; a blocked storage does not throw', () => {
        const store = createLocalSettingsStore()
        store.save(DEFAULT_SETTINGS)
        store.clear()
        expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toBeNull()
        const blocked = createLocalSettingsStore(() => {
            throw new Error('SecurityError')
        })
        expect(() => blocked.clear()).not.toThrow()
    })
})

describe('parseAccountPreferences', () => {
    test('garbage reads as the defaults', () => {
        expect(parseAccountPreferences(null)).toEqual(DEFAULT_ACCOUNT_PREFERENCES)
        expect(parseAccountPreferences({ notifications: [1], privacy: 'x', security: 3 })).toEqual(DEFAULT_ACCOUNT_PREFERENCES)
    })

    test('withPreference re-validates: an unknown policy or a non-boolean is refused', () => {
        const prefs = parseAccountPreferences({})
        expect(withPreference(prefs, 'privacy', 'challengePolicy', 'nobody').privacy.challengePolicy).toBe('nobody')
        expect(withPreference(prefs, 'privacy', 'challengePolicy', 'strangers').privacy.challengePolicy).toBe('everyone')
        expect(withPreference(prefs, 'notifications', 'browser', 'yes').notifications.browser).toBe(false)
        expect(withPreference(prefs, 'notifications', 'invented', true).notifications).not.toHaveProperty('invented')
    })
})
