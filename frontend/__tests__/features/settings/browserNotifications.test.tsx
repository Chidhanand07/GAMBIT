// SETTINGS-PREFS (ADR F-140): "Browser notifications" shows a desktop alert for an incoming
// challenge while Gambit is in the background, and only then.
import { act, render } from '@testing-library/react'
import { createFakeSocket } from '../../characterization/fakeSocket'

const socket = createFakeSocket()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('@/components/SocketProvider', () => ({ useSocket: () => socket }))
jest.mock('@/components/Toast', () => ({ useToast: () => ({ toast: jest.fn() }) }))

import { useChallengeBanner } from '@/features/navigation/hooks/useChallengeBanner'
import { SettingsProvider } from '@/features/settings/SettingsProvider'
import { DEFAULT_SETTINGS } from '@/features/settings/model'
import { browserPermission, requestBrowserPermission, showBackgroundNotification } from '@/lib/browserNotifications'
import { DEFAULT_ACCOUNT_PREFERENCES, withPreference } from '@/lib/preferences'
import type { AccountPreferences } from '@/types/preferences'
import { settingsStore } from '../../helpers/settingsStore'

const shown: { title: string; body?: string }[] = []
function installNotification(permission: NotificationPermission) {
    const N = function (this: unknown, title: string, opts: { body?: string }) {
        shown.push({ title, body: opts?.body })
    } as unknown as typeof Notification
    Object.assign(N, { permission, requestPermission: jest.fn(async () => permission) })
    ;(window as any).Notification = N
}
const setHidden = (hidden: boolean) => Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })

const CHALLENGE = { from_user_id: 'u-2', from_username: 'opp', to_user_id: 'u-1', time_control: '3+0' }

function Listener() {
    useChallengeBanner({ id: 'u-1', username: 'me' } as any)
    return null
}
const mount = (account: AccountPreferences) =>
    render(<SettingsProvider store={settingsStore(DEFAULT_SETTINGS, account)}><Listener /></SettingsProvider>)

const on = withPreference(DEFAULT_ACCOUNT_PREFERENCES, 'notifications', 'browser', true)

beforeEach(() => {
    shown.length = 0
    installNotification('granted')
    setHidden(true)
})
afterAll(() => {
    delete (window as any).Notification
    setHidden(false)
})

describe('background alert for a challenge', () => {
    test('switch on, permission granted, tab hidden → one desktop notification naming the challenger', () => {
        mount(on)
        act(() => socket.serverSends('challenge_request', CHALLENGE))
        expect(shown).toEqual([{ title: 'opp challenged you', body: 'Gambit' }])
    })

    test('switch off (default) → none', () => {
        mount(DEFAULT_ACCOUNT_PREFERENCES)
        act(() => socket.serverSends('challenge_request', CHALLENGE))
        expect(shown).toEqual([])
    })

    test('"Challenges" off → none, even with browser alerts on', () => {
        mount(withPreference(on, 'notifications', 'challenges', false))
        act(() => socket.serverSends('challenge_request', CHALLENGE))
        expect(shown).toEqual([])
    })

    test('tab in the foreground (the in-app toast shows) or no permission → none', () => {
        setHidden(false)
        mount(on)
        act(() => socket.serverSends('challenge_request', CHALLENGE))
        installNotification('denied')
        setHidden(true)
        act(() => socket.serverSends('challenge_request', CHALLENGE))
        expect(shown).toEqual([])
    })
})

describe('lib/browserNotifications without the API', () => {
    test('reports unsupported and never throws', async () => {
        delete (window as any).Notification
        expect(browserPermission()).toBe('unsupported')
        await expect(requestBrowserPermission()).resolves.toBe('unsupported')
        expect(showBackgroundNotification('t', 'b')).toBe(false)
    })
})
