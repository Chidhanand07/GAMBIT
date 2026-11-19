// SETTINGS-PREFS (ADR F-140): the Notifications, Privacy and Account cards of
// design/Settings.dc.html edit the account preferences, preview them and save them.
import { act, fireEvent, render, screen, within } from '@testing-library/react'

const push = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: jest.fn() }) }))
jest.mock('next/link', () => ({ __esModule: true, default: ({ children, href }: any) => <a href={href}>{children}</a> }))
const profile = {
    id: 'u-1', username: 'me1', display_name: 'Maverick', bio: '', country: '', avatar_url: null,
    rating_bullet: 1200, rating_blitz: 1200, rating_rapid: 1025.4, rating_classical: 1200, created_at: '2024-01-01',
}
jest.mock('@/components/ProfileProvider', () => ({ useProfile: () => ({ profile, loading: false, refetch: jest.fn() }) }))
let authUser: { email: string; new_email: string | null; identities?: { provider: string }[] } = { email: 'me@example.com', new_email: null }
const signOut = jest.fn(async () => ({ error: null }))
jest.mock('@/lib/supabase/client', () => ({
    createClient: () => ({ auth: { getUser: async () => ({ data: { user: authUser } }), signOut } }),
}))

import SettingsPage from '@/app/settings/page'
import { SettingsProvider } from '@/features/settings/SettingsProvider'
import { DEFAULT_SETTINGS } from '@/features/settings/model'
import { settingsStore } from '../../helpers/settingsStore'

const flush = async () => {
    for (let i = 0; i < 5; i++) await act(async () => {})
}

const reply = (status: number, body: unknown) => ({ ok: status < 300, status, headers: new Headers(), json: async () => body })
let fetchMock: jest.Mock
let emailReply = reply(200, { pending: true, email: 'new@example.com' })
let deleteReply = reply(200, { deleted: true })
beforeEach(() => {
    deleteReply = reply(200, { deleted: true })
    push.mockClear()
    authUser = { email: 'me@example.com', new_email: null }
    emailReply = reply(200, { pending: true, email: 'new@example.com' })
    fetchMock = jest.fn(async (url: string) =>
        url === '/api/account/email' ? emailReply : url === '/api/account/delete' ? deleteReply : reply(200, [{ username: 'x' }, { username: 'me1' }]))
    ;(global as any).fetch = fetchMock
    window.history.replaceState(null, '', '/settings')
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

describe('Account: change email (F-143)', () => {
    const emailBox = () => screen.getByPlaceholderText('you@example.com') as HTMLInputElement

    test('editable, prefilled with the sign-in address; Save sends a changed address and shows it pending', async () => {
        const store = open('Account')
        await flush()
        expect(emailBox().value).toBe('me@example.com')
        fireEvent.change(emailBox(), { target: { value: 'New@Example.com' } })
        expect(within(screen.getByRole('complementary', { name: 'Live preview' })).getByText('New@Example.com')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
        await flush()
        const call = fetchMock.mock.calls.find(([url]) => url === '/api/account/email')!
        expect(JSON.parse(call[1].body)).toEqual({ email: 'new@example.com' })
        expect(screen.getByText('Confirmation sent to new@example.com. Follow the link in that email to finish the change.')).toBeInTheDocument()
        expect(store.saved).toHaveLength(1)
    })

    test('an unchanged address sends nothing; a refused change shows the reason and the switches are not saved', async () => {
        const store = open('Account')
        await flush()
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
        await flush()
        expect(fetchMock.mock.calls.some(([url]) => url === '/api/account/email')).toBe(false)
        emailReply = reply(409, { error: 'An account with this email already exists.' })
        fireEvent.change(emailBox(), { target: { value: 'taken@example.com' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
        await flush()
        expect(screen.getByRole('alert')).toHaveTextContent('An account with this email already exists.')
        expect(store.saved).toHaveLength(1)
        emailReply = reply(429, { error: 'rate_limited' })
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
        await flush()
        expect(screen.getByRole('alert')).toHaveTextContent('Too many attempts. Try again later.')
    })

    test('a change already waiting for confirmation is shown on load; Reset puts the current address back', async () => {
        authUser = { email: 'me@example.com', new_email: 'later@example.com' }
        open('Account')
        await flush()
        expect(screen.getByText(/Confirmation sent to later@example.com/)).toBeInTheDocument()
        fireEvent.change(emailBox(), { target: { value: 'x@example.com' } })
        fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }))
        expect(emailBox().value).toBe('me@example.com')
    })

    test('back from a confirmation link: the Account card opens and says how it went', async () => {
        window.history.replaceState(null, '', '/settings?email=link_invalid')
        render(<SettingsProvider store={settingsStore()}><SettingsPage /></SettingsProvider>)
        await flush()
        expect(screen.getByRole('heading', { name: 'Account' })).toBeInTheDocument()
        expect(screen.getByRole('alert')).toHaveTextContent('That confirmation link is invalid or has expired.')
        expect(window.location.search).toBe('')
    })
})

describe('Account: delete account (F-145)', () => {
    async function openDialog(identities = [{ provider: 'email' }]) {
        authUser = { email: 'me@example.com', new_email: null, identities }
        open('Account')
        await flush()
        fireEvent.click(screen.getByRole('button', { name: 'Delete account' }))
        return screen.getByRole('alertdialog', { name: 'Delete account' })
    }

    test('the red zone of the mockup; the dialog only submits with the exact username and the password', async () => {
        const dialog = await openDialog()
        expect(screen.getByText('Permanently removes your profile, games and ratings.')).toBeInTheDocument()
        const submit = within(dialog).getByRole('button', { name: 'Delete my account' })
        expect(submit).toBeDisabled()
        fireEvent.change(within(dialog).getByPlaceholderText('me1'), { target: { value: 'ME1' } })
        expect(submit).toBeDisabled()
        fireEvent.change(within(dialog).getByPlaceholderText('me1'), { target: { value: 'me1' } })
        expect(submit).toBeDisabled()
        fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: 'pw' } })
        expect(submit).toBeEnabled()
        fireEvent.click(submit)
        await flush()
        const call = fetchMock.mock.calls.find(([url]) => url === '/api/account/delete')!
        expect(JSON.parse(call[1].body)).toEqual({ confirmUsername: 'me1', password: 'pw' })
        expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
        expect(push).toHaveBeenCalledWith('/')
    })

    test('an OAuth-only account is not asked for a password; a refusal is explained and nothing is left', async () => {
        deleteReply = reply(409, { error: 'active_game' })
        const dialog = await openDialog([{ provider: 'google' }])
        expect(within(dialog).queryByLabelText('Password')).not.toBeInTheDocument()
        fireEvent.change(within(dialog).getByPlaceholderText('me1'), { target: { value: 'me1' } })
        fireEvent.click(within(dialog).getByRole('button', { name: 'Delete my account' }))
        await flush()
        expect(within(dialog).getByRole('alert')).toHaveTextContent('Finish or resign your current game first.')
        expect(push).not.toHaveBeenCalled()
        fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
})

