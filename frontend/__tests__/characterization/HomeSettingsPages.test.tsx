/**
 * Characterization tests (fe-misc, PR 16 track) for app/page.tsx (landing) and app/settings/page.tsx.
 */
import { AXE_TIMEOUT_MS, expectAccessible } from '../helpers/axe'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { jsonResponse } from './fakeSocket'

const push = jest.fn()
const back = jest.fn()
const router = { push, back, replace: jest.fn(), prefetch: jest.fn() }
jest.mock('next/navigation', () => ({ useRouter: () => router }))
jest.mock('next/dynamic', () => () => (props: any) => <div data-testid="dynamic" data-mode={props.mode} />)
jest.mock('next/link', () => ({
    __esModule: true,
    default: ({ children, href, onMouseEnter, onMouseLeave, style, className, 'aria-label': ariaLabel }: any) => (
        <a href={href} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} style={style} className={className} aria-label={ariaLabel}>{children}</a>
    ),
}))

let profileState: any = { profile: null, loading: false, refetch: jest.fn() }
jest.mock('@/components/ProfileProvider', () => ({ useProfile: () => profileState }))

const storage = {
    upload: jest.fn(),
    getPublicUrl: jest.fn(),
}
jest.mock('@/lib/supabase/client', () => ({
    createClient: () => ({ storage: { from: (bucket: string) => ({ upload: (...a: any[]) => storage.upload(bucket, ...a), getPublicUrl: storage.getPublicUrl }) } }),
}))

// F-112: app/page.tsx is an async Server Component that resolves the viewer; the page itself is
// LandingPage, rendered here for a guest. The seeded header has its own tests (AppHeader.test.tsx).
jest.mock('@/features/navigation/components/AppHeaderContainer', () => ({
    SeededAppHeader: ({ viewer }: any) => <header data-testid="seeded-header" data-viewer={viewer.status} />,
}))
import { LandingPage } from '@/features/landing/components/LandingPage'
const Home = () => <LandingPage viewer={{ status: 'guest' }} />
import SettingsPage from '@/app/settings/page'
import { SettingsProvider } from '@/features/settings/SettingsProvider'

const flush = async () => {
    for (let i = 0; i < 6; i++) await act(async () => {})
}

afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
})

describe('landing page', () => {
    // Redesign (Home.dc.html): the canvas KnightBackground and the animated demo board are gone;
    // the board is a static King's Gambit position with the last move highlighted.
    const squareAt = (c: HTMLElement, sq: string) => c.querySelector<HTMLElement>(`[data-square="${sq}"]`)!

    test('renders the hero, features and footer links', () => {
        render(<Home />)
        expect(screen.getByText('Free to play')).toBeInTheDocument()
        expect(screen.getByText(/Play Now/).closest('a')).toHaveAttribute('href', '/lobby')
        expect(screen.getByText('Create Account').closest('a')).toHaveAttribute('href', '/signup')
        expect(screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent)).toEqual([
            'Bullet Games', 'Accuracy Rating', 'Play Friends', 'Leaderboards', 'Full Rules', 'Play Anywhere',
        ])
        expect(screen.getByTestId('seeded-header')).toHaveAttribute('data-viewer', 'guest')
        const footerLinks = [...document.querySelectorAll('footer a')].map(a => [a.textContent, a.getAttribute('href')])
        expect(footerLinks).toEqual([['Play', '/lobby'], ['Leaderboard', '/leaderboard'], ['Analysis', '/analysis'], ['Offline', '/offline']])
        expect(screen.getByText('© 2026 Gambit')).toBeInTheDocument()
    })

    test('hover styling of the CTAs and feature cards comes from the mockup classes', () => {
        render(<Home />)
        expect(screen.getByText(/Play Now/).closest('a')).toHaveClass('gb-flat', 'bg-accent')
        // content-box like the mockup's link: 56px + 1px border each side = 58px
        expect(screen.getByText('Create Account').closest('a')).toHaveClass('hover:bg-surface-raised', 'border-line-field', 'box-content', 'min-h-[56px]')
        expect(screen.getByText('Bullet Games').parentElement).toHaveClass('fc')
    })

    test("hero claims: the time-control count comes from the real presets", () => {
        render(<Home />)
        expect(screen.getByText('time controls').previousSibling).toHaveTextContent('6')
        expect(screen.getByText('games available').previousSibling).toHaveTextContent('∞')
        // ∞ is not in the JetBrains Mono subsets: drawn with the mockup's next fallback (ui-monospace)
        expect(screen.getByText('∞')).toHaveClass('font-[ui-monospace,monospace]')
        expect(screen.getByText('always').previousSibling).toHaveTextContent('Free')
    })

    test("hero board shows the King's Gambit after 4. h4 with h2-h4 highlighted", () => {
        const { container } = render(<Home />)
        expect(screen.getByRole('img', { name: "King's Gambit position after 4. h4" })).toBeInTheDocument()
        expect(squareAt(container, 'h2')).toHaveClass('bg-board-hero-last-dark')
        expect(squareAt(container, 'h4')).toHaveClass('bg-board-hero-last-dark')
        expect(squareAt(container, 'g4')).toHaveClass('bg-board-light')
        expect(squareAt(container, 'h3')).toHaveClass('bg-board-light')
        expect(squareAt(container, 'h1')).toHaveClass('bg-board-light')
        // F-111: a static Server Component board (no client Board): 31 SVG pieces in the squares.
        expect(container.querySelectorAll('[data-square] [data-piece]')).toHaveLength(31) // white's f-pawn was taken (2... exf4)
        expect(screen.getByText("King's Gambit · 1. e4 e5 2. f4 exf4 3. Nf3 g5 4. h4")).toBeInTheDocument()
    })

    test('[F-110] signed in: Play Now goes straight to the lobby and My Profile replaces Create Account', () => {
        render(<LandingPage viewer={{ status: 'signed-in', profile: { id: 'u1', username: 'alice', display_name: 'Alice', avatar_url: null, rating_rapid: 1500 } }} />)
        expect(screen.getByText(/Play Now/).closest('a')).toHaveAttribute('href', '/lobby')
        expect(screen.getByText('My Profile').closest('a')).toHaveAttribute('href', '/profile/alice')
        expect(screen.queryByText('Create Account')).toBeNull()
        expect(screen.getByTestId('seeded-header')).toHaveAttribute('data-viewer', 'signed-in')
    })

    test('[F-114] JSON-LD is rendered as one escaped ld+json script', () => {
        const { container } = render(<Home />)
        const scripts = container.querySelectorAll('script[type="application/ld+json"]')
        expect(scripts).toHaveLength(1)
        const data = JSON.parse(scripts[0].textContent!)
        expect(data['@graph'].map((n: any) => n['@type'])).toEqual(['WebSite', 'SoftwareApplication'])
    })
})

describe('landing demo board timers (F17)', () => {
    test('the static board schedules no timers', () => {
        jest.useFakeTimers()
        const { unmount } = render(<Home />)
        act(() => { jest.advanceTimersByTime(900 * 10) })
        expect(jest.getTimerCount()).toBe(0)
        unmount()
        expect(jest.getTimerCount()).toBe(0)
    })
})

describe('settings page', () => {
    const ME = {
        id: 'u-1', username: 'me1', display_name: 'Me', bio: 'hi', country: 'India', avatar_url: null,
        rating_bullet: 1100.4, rating_blitz: 1200.6, rating_rapid: null, rating_classical: 1400, created_at: '2024-03-01T00:00:00Z',
    }
    let fetchMock: jest.Mock
    beforeEach(() => {
        push.mockClear()
        back.mockClear()
        storage.upload.mockReset()
        storage.getPublicUrl.mockReset()
        profileState = { profile: { ...ME }, loading: false, refetch: jest.fn() }
        fetchMock = jest.fn(async () => jsonResponse({}))
        ;(global as any).fetch = fetchMock
    })

    // Redesign: the spinner became a "Loading settings…" status line.
    test('loading shows a loading status; signed-out pushes /login and renders nothing', () => {
        profileState = { profile: null, loading: true, refetch: jest.fn() }
        const { container, rerender } = render(<SettingsPage />)
        expect(screen.getByRole('status')).toHaveTextContent('Loading settings…')
        profileState = { profile: null, loading: false, refetch: jest.fn() }
        rerender(<SettingsPage />)
        expect(container.innerHTML).toBe('')
        expect(push.mock.calls).toEqual([['/login']])
    })

    test('F17: the signed-out redirect runs once, from an effect, not on every render', () => {
        profileState = { profile: null, loading: false, refetch: jest.fn() }
        const { rerender } = render(<SettingsPage />)
        rerender(<SettingsPage />)
        rerender(<SettingsPage />)
        expect(push.mock.calls).toEqual([['/login']])
    })

    test('a refetch of the same profile keeps unsaved edits; a different profile prefills again', () => {
        const { rerender } = render(<SettingsPage />)
        fireEvent.change(screen.getByDisplayValue('Me'), { target: { value: 'Edited' } })
        profileState = { ...profileState, profile: { ...ME, display_name: 'Server copy' } }
        rerender(<SettingsPage />)
        expect(screen.getByDisplayValue('Edited')).toBeInTheDocument()
        profileState = { ...profileState, profile: { ...ME, id: 'u-2', display_name: 'Other' } }
        rerender(<SettingsPage />)
        expect(screen.getByDisplayValue('Other')).toBeInTheDocument()
    })

    test('form is prefilled from the profile and saves trimmed values with PATCH', async () => {
        jest.useFakeTimers()
        render(<SettingsPage />)
        expect(screen.getByDisplayValue('Me')).toBeInTheDocument()
        expect(screen.getByDisplayValue('hi')).toBeInTheDocument()
        expect(screen.getByDisplayValue('India')).toBeInTheDocument()
        expect(screen.getByText('2/160')).toBeInTheDocument()
        // Redesign (was 'Member since 2024'): the card header shows the handle, as in Settings.dc.html
        expect(screen.getAllByText('@me1').length).toBeGreaterThan(0)
        fireEvent.change(screen.getByDisplayValue('Me'), { target: { value: '  New Name ' } })
        fireEvent.change(screen.getByDisplayValue('hi'), { target: { value: '   ' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
        await flush()
        expect(fetchMock.mock.calls).toEqual([['/api/profile/me', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ displayName: 'New Name', bio: null, country: 'India' }),
        }]])
        expect(profileState.refetch).toHaveBeenCalledTimes(1)
        // Redesign: "Saved!" on the button became the "Changes saved." status line
        expect(screen.getAllByRole('status')[0]).toHaveTextContent('Changes saved.')
        act(() => { jest.advanceTimersByTime(2500) })
        expect(screen.getAllByRole('status')[0]).toHaveTextContent('')
    })

    test('save errors: API error text, fallback text, network error', async () => {
        render(<SettingsPage />)
        fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Too long' }, false))
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
        await flush()
        expect(screen.getByText('Too long')).toBeInTheDocument()
        fetchMock.mockResolvedValueOnce(jsonResponse({}, false))
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
        await flush()
        expect(screen.getByText('Failed to save')).toBeInTheDocument()
        fetchMock.mockRejectedValueOnce(new Error('x'))
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
        await flush()
        expect(screen.getByText('Network error — try again')).toBeInTheDocument()
    })

    test('form does not reset when the profile object changes but the id does not', () => {
        const { rerender } = render(<SettingsPage />)
        profileState = { ...profileState, profile: { ...ME, display_name: 'Other' } }
        rerender(<SettingsPage />)
        expect(screen.getByDisplayValue('Me')).toBeInTheDocument()
        profileState = { ...profileState, profile: { ...ME, id: 'u-2', display_name: 'Other' } }
        rerender(<SettingsPage />)
        expect(screen.getByDisplayValue('Other')).toBeInTheDocument()
    })

    test('avatar upload: storage upsert, PATCH avatarUrl, cache-busted preview, refetch', async () => {
        jest.spyOn(Date, 'now').mockReturnValue(1234)
        storage.upload.mockResolvedValue({ error: null })
        storage.getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn/u-1/avatar.png' } })
        const { container } = render(<SettingsPage />)
        expect(screen.getAllByText('M')).toHaveLength(2) // card avatar + live preview
        const file = new File(['x'], 'me.photo.png', { type: 'image/png' })
        fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } })
        await flush()
        expect(storage.upload).toHaveBeenCalledWith('avatars', 'u-1/avatar.png', file, { upsert: true })
        expect(storage.getPublicUrl).toHaveBeenCalledWith('u-1/avatar.png')
        expect(fetchMock.mock.calls).toEqual([['/api/profile/me', {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ avatarUrl: 'https://cdn/u-1/avatar.png' }),
        }]])
        expect(container.querySelector('img')).toHaveAttribute('src', 'https://cdn/u-1/avatar.png?t=1234')
        expect(profileState.refetch).toHaveBeenCalledTimes(1)
    })

    test('avatar upload error is shown', async () => {
        storage.upload.mockResolvedValue({ error: { message: 'too big' } })
        const { container } = render(<SettingsPage />)
        fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(['x'], 'a.jpg')] } })
        await flush()
        expect(screen.getByText('Upload failed: too big')).toBeInTheDocument()
        expect(fetchMock).not.toHaveBeenCalled()
    })

    test('Board & pieces: rows edit the live preview; Save stores them, Reset restores the defaults', () => {
        localStorage.clear()
        render(<SettingsProvider><SettingsPage /></SettingsProvider>)
        fireEvent.click(screen.getByRole('button', { name: 'Board & pieces' }))
        const coords = screen.getByRole('switch', { name: 'Show coordinates' })
        const preview = () => screen.getByRole('img', { name: 'Board preview' })
        // [F-100] off by default, like the Game and Analysis boards; the preview follows the switch
        expect(coords).toHaveAttribute('aria-checked', 'false')
        expect(within(preview()).queryByText('a')).toBeNull()
        fireEvent.click(coords)
        expect(coords).toHaveAttribute('aria-checked', 'true')
        expect(within(preview()).getByText('a')).toBeInTheDocument()
        expect(within(preview()).getByText('8')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Walnut' }))
        expect(screen.getByRole('button', { name: 'Walnut' })).toHaveAttribute('aria-pressed', 'true')
        expect(screen.getByRole('img', { name: 'Board preview' }).querySelector('.bg-board-walnut-light')).not.toBeNull()
        expect(localStorage.getItem('gambit-settings')).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
        expect(JSON.parse(localStorage.getItem('gambit-settings')!)).toMatchObject({ boardTheme: 'walnut', showCoordinates: true })
        expect(screen.getByRole('status')).toHaveTextContent('Changes saved.')
        fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }))
        expect(screen.getByRole('button', { name: 'Maple' })).toHaveAttribute('aria-pressed', 'true')
        expect(screen.getByRole('status')).toHaveTextContent('Defaults restored.')
    })

    test('[F-104] one "Reset to defaults" for every section, as in Settings.dc.html', () => {
        localStorage.clear()
        render(<SettingsProvider><SettingsPage /></SettingsProvider>)
        // an unsaved profile edit and an unsaved board edit
        fireEvent.change(screen.getByDisplayValue('Me'), { target: { value: 'Edited' } })
        fireEvent.click(screen.getByRole('button', { name: 'Board & pieces' }))
        fireEvent.click(screen.getByRole('button', { name: 'Walnut' }))
        // Reset from the profile section: says "Defaults restored." (was: "Changes discarded.")
        fireEvent.click(screen.getByRole('button', { name: 'Public profile' }))
        fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }))
        expect(screen.getByDisplayValue('Me')).toBeInTheDocument()
        expect(screen.getAllByRole('status')[0]).toHaveTextContent('Defaults restored.')
        // …and the board draft went back to its defaults too; nothing was stored
        fireEvent.click(screen.getByRole('button', { name: 'Board & pieces' }))
        expect(screen.getByRole('button', { name: 'Maple' })).toHaveAttribute('aria-pressed', 'true')
        expect(localStorage.getItem('gambit-settings')).toBeNull()
    })

    test('[F-104] the live preview marks the selected piece and its moves in green (Settings.dc.html)', () => {
        render(<SettingsPage />)
        fireEvent.click(screen.getByRole('button', { name: 'Board & pieces' }))
        const preview = screen.getByRole('img', { name: 'Board preview' })
        expect(preview.querySelector('[data-mark="selected"]')).toHaveClass('bg-mark-preview-hint')
        const dots = preview.querySelectorAll('[data-dot]')
        expect(dots).toHaveLength(2)
        for (const dot of dots) expect(dot).toHaveClass('bg-mark-preview-dot', 'h-[34%]', 'left-[33%]')
    })

    test('[A4] every settings section has no axe violations', async () => {
        const { container } = render(<SettingsProvider><SettingsPage /></SettingsProvider>)
        await expectAccessible(container)
        for (const section of ['Board & pieces', 'Gameplay', 'Account']) {
            fireEvent.click(screen.getByRole('button', { name: section }))
            await expectAccessible(container)
        }
    }, AXE_TIMEOUT_MS)

    test('Gameplay: auto-queen and resign confirmation drive the preview demo', () => {
        render(<SettingsPage />)
        fireEvent.click(screen.getByRole('button', { name: 'Gameplay' }))
        fireEvent.click(screen.getByRole('button', { name: 'Promote pawn' }))
        expect(screen.getByText('Promoted to a queen automatically.')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('switch', { name: 'Auto-queen' }))
        fireEvent.click(screen.getByRole('button', { name: 'Promote pawn' }))
        fireEvent.click(screen.getByRole('button', { name: 'Knight' }))
        expect(screen.getByText('You chose a knight.')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Resign game' }))
        fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
        expect(screen.getByText('You resigned. Game over.')).toBeInTheDocument()
    })

    test('[REDESIGN-INTEGRATION] only settings that work are offered: no Notifications/Privacy tabs or unbacked account, gameplay or profile controls', () => {
        render(<SettingsPage />)
        const sections = within(screen.getByRole('group', { name: 'Settings sections' })).getAllByRole('button').map(b => b.textContent)
        expect(sections).toEqual(['Public profile', 'Board & pieces', 'Gameplay', 'Account'])
        const unbacked = /notification|privacy|two-factor|2fa|sign-in emails|delete account|change email|premove|takeback|move by|piece set|pronoun|playing style|experience|favou?rite|website|city|visib/i
        for (const section of sections) {
            fireEvent.click(screen.getByRole('button', { name: section! }))
            const controls = [...screen.queryAllByRole('switch'), ...screen.queryAllByRole('button'), ...screen.queryAllByRole('textbox')]
            const names = controls.map(c => `${c.getAttribute('aria-label') ?? ''} ${c.textContent ?? ''} ${(c as HTMLInputElement).placeholder ?? ''}`)
            expect(names.filter(n => unbacked.test(n))).toEqual([])
            expect(document.body.textContent).not.toMatch(/two-factor|delete account|change email|premove|pronouns/i)
        }
    })

    test('account tab shows read-only username and rounded ratings (1200 fallback)', () => {
        render(<SettingsPage />)
        fireEvent.click(screen.getByRole('button', { name: 'Account' }))
        expect(screen.queryByText('Public profile', { selector: 'h2' })).not.toBeInTheDocument()
        // Redesign: read-only (Settings.dc.html) instead of disabled
        expect(screen.getByDisplayValue('me1')).toHaveAttribute('readonly')
        const ratings = ['Bullet', 'Blitz', 'Rapid', 'Classical'].map(r => screen.getByText(r).parentElement!.textContent)
        expect(ratings).toEqual(['Bullet1100', 'Blitz1201', 'Rapid1200', 'Classical1400'])
        // Redesign: the back button is a "Back to profile" link (was router.back())
        expect(screen.getByRole('link', { name: 'Back to profile' })).toHaveAttribute('href', '/profile/me1')
        expect(back).not.toHaveBeenCalled()
    })
})
