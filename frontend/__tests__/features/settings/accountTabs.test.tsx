// SETTINGS-PREFS (ADR F-140): the Notifications, Privacy and Account cards of
// design/Settings.dc.html edit the account preferences, preview them and save them.
import { act, fireEvent, render, screen, within } from '@testing-library/react'

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href }: any) => <a href={href}>{children}</a> }))
const profile = {
    id: 'u-1', username: 'me1', display_name: 'Maverick', bio: '', country: '', avatar_url: null,
    rating_bullet: 1200, rating_blitz: 1200, rating_rapid: 1025.4, rating_classical: 1200, created_at: '2024-01-01',
}
jest.mock('@/components/ProfileProvider', () => ({ useProfile: () => ({ profile, loading: false, refetch: jest.fn() }) }))
jest.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

import SettingsPage from '@/app/settings/page'
import { SettingsProvider } from '@/features/settings/SettingsProvider'
import { DEFAULT_SETTINGS } from '@/features/settings/model'
import { settingsStore } from '../../helpers/settingsStore'

const flush = async () => {
    for (let i = 0; i < 5; i++) await act(async () => {})
}

let fetchMock: jest.Mock
beforeEach(() => {
    fetchMock = jest.fn(async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => [{ username: 'x' }, { username: 'me1' }] }))
    ;(global as any).fetch = fetchMock
})

function open(section: string, store = settingsStore()) {
    render(<SettingsProvider store={store}><SettingsPage /></SettingsProvider>)
    fireEvent.click(within(screen.getByRole('group', { name: 'Settings sections' })).getByRole('button', { name: section }))
    return store
}

describe('Notifications', () => {
    test('every row of the mockup, the mockup defaults, and the preview follows the draft', () => {
        open('Notifications')
        expect(screen.getByRole('heading', { name: 'Notifications' })).toBeInTheDocument()
        expect(screen.getByText('Choose what Gambit tells you about.')).toBeInTheDocument()
        const switches = screen.getAllByRole('switch').map((s) => [s.getAttribute('aria-label'), s.getAttribute('aria-checked')])
        expect(switches).toEqual([
            ['Challenges', 'true'],
            ['Friend requests', 'true'],
            ['Game results', 'true'],
            ['Your turn (daily games)', 'true'],
            ['Weekly email digest', 'false'],
            ['Browser notifications', 'false'],
        ])
        const preview = screen.getByRole('complementary', { name: 'Live preview' })
        expect(within(preview).getByText('A friend challenged you')).toBeInTheDocument()
        expect(within(preview).getByText('Blitz · 3 min')).toBeInTheDocument()
        for (const name of ['Challenges', 'Friend requests', 'Game results', 'Your turn (daily games)']) {
            fireEvent.click(screen.getByRole('switch', { name }))
        }
        expect(within(preview).getByText("You won't be notified about anything.")).toBeInTheDocument()
    })

    test('Save stores the draft; Reset restores the section defaults', async () => {
        const store = open('Notifications')
        fireEvent.click(screen.getByRole('switch', { name: 'Game results' }))
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
        await flush()
        expect(store.current().account.notifications.gameResults).toBe(false)
        expect(screen.getByRole('status')).toHaveTextContent('Changes saved.')
        fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }))
        expect(screen.getByRole('switch', { name: 'Game results' })).toHaveAttribute('aria-checked', 'true')
        expect(screen.getByRole('status')).toHaveTextContent('Defaults restored.')
    })

    test('turning browser notifications on asks the browser; a refusal shows in the preview', async () => {
        const requestPermission = jest.fn(async () => 'denied')
        ;(window as any).Notification = Object.assign(function Notification() {}, { permission: 'default', requestPermission })
        open('Notifications')
        fireEvent.click(screen.getByRole('switch', { name: 'Browser notifications' }))
        await flush()
        expect(requestPermission).toHaveBeenCalledTimes(1)
        expect(screen.getByText('Browser alerts blocked')).toBeInTheDocument()
        delete (window as any).Notification
    })
})

describe('Privacy', () => {
    test('rows, real name, rating and leaderboard place in the preview', async () => {
        open('Privacy')
        await flush()
        expect(screen.getByText('Control who can see and reach you.')).toBeInTheDocument()
        expect(screen.getAllByRole('switch').map((s) => s.getAttribute('aria-label'))).toEqual([
            'Show when I am online', 'Appear in search', 'Show on leaderboard', 'Allow spectators',
        ])
        const preview = screen.getByRole('complementary', { name: 'Live preview' })
        expect(within(preview).getByText('Maverick')).toBeInTheDocument()
        expect(within(preview).getByText('Online')).toBeInTheDocument()
        expect(within(preview).getByText('#2 · 1025')).toBeInTheDocument()
        expect(fetchMock).toHaveBeenCalledWith('/api/leaderboard?field=rating_rapid')
        fireEvent.click(screen.getByRole('button', { name: 'Friends' }))
        fireEvent.click(screen.getByRole('switch', { name: 'Show on leaderboard' }))
        fireEvent.click(screen.getByRole('switch', { name: 'Allow spectators' }))
        fireEvent.click(screen.getByRole('switch', { name: 'Show when I am online' }))
        expect(within(preview).getByText('Friends only')).toBeInTheDocument()
        expect(within(preview).getByText('Not listed')).toBeInTheDocument()
        expect(within(preview).getByText('Spectating off')).toBeInTheDocument()
        expect(within(preview).getByText('Last seen recently')).toBeInTheDocument()
    })

    test('a failed save is reported and nothing changes app-wide', async () => {
        const store = settingsStore()
        ;(store.save as jest.Mock).mockRejectedValueOnce(new Error('500'))
        open('Privacy', store)
        fireEvent.click(screen.getByRole('button', { name: 'Nobody' }))
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
        await flush()
        expect(screen.getByRole('alert')).toHaveTextContent('Could not save your settings. Try again.')
        expect(store.current().account.privacy.challengePolicy).toBe('everyone')
    })
})

describe('Account', () => {
    test('"Email me on new sign-ins" is a stored preference shown in the preview', async () => {
        const store = open('Account', settingsStore(DEFAULT_SETTINGS))
        const preview = screen.getByRole('complementary', { name: 'Live preview' })
        expect(within(preview).getByText('New sign-in emails on')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('switch', { name: 'Email me on new sign-ins' }))
        expect(within(preview).getByText('New sign-in emails off')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
        await flush()
        expect(store.current().account.security.emailOnNewSignIn).toBe(false)
    })
})
