/**
 * Characterization tests (fe-misc, PR 16 track) for app/page.tsx (landing) and app/settings/page.tsx.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { jsonResponse } from './fakeSocket'

const push = jest.fn()
const back = jest.fn()
const router = { push, back, replace: jest.fn(), prefetch: jest.fn() }
jest.mock('next/navigation', () => ({ useRouter: () => router }))
jest.mock('next/dynamic', () => () => (props: any) => <div data-testid="dynamic" data-mode={props.mode} />)
jest.mock('next/link', () => ({
    __esModule: true,
    default: ({ children, href, onMouseEnter, onMouseLeave, style, className }: any) => (
        <a href={href} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} style={style} className={className}>{children}</a>
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

import Home from '@/app/page'
import SettingsPage from '@/app/settings/page'

const flush = async () => {
    for (let i = 0; i < 6; i++) await act(async () => {})
}

afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
})

describe('landing page', () => {
    const highlighted = (c: HTMLElement) =>
        [...c.querySelectorAll<HTMLElement>('.board-inner-frame > div')]
            .map((d, i) => [i, d.style.background] as const)
            .filter(([, bg]) => bg.startsWith('rgba(196, 150, 90'))
            .map(([i]) => i)
    const pieces = (c: HTMLElement) => [...c.querySelectorAll('.board-inner-frame > div')].map(d => d.textContent || '.').join('')

    test('renders KnightBackground in landing mode, hero, features and footer links', () => {
        render(<Home />)
        expect(screen.getByTestId('dynamic')).toHaveAttribute('data-mode', 'landing')
        expect(screen.getByText('Free to play')).toBeInTheDocument()
        expect(screen.getByText(/Play Now/).closest('a')).toHaveAttribute('href', '/lobby')
        expect(screen.getByText('Create Account').closest('a')).toHaveAttribute('href', '/signup')
        expect(screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent)).toEqual([
            'Bullet Games', 'Accuracy Rating', 'Play Friends', 'Leaderboards', 'Full Rules', 'Play Anywhere',
        ])
        const footerLinks = [...document.querySelectorAll('footer a')].map(a => [a.textContent, a.getAttribute('href')])
        expect(footerLinks).toEqual([['Play', '/lobby'], ['Leaderboard', '/leaderboard'], ['Analysis', '/analysis'], ['Offline', '/offline']])
        expect(screen.getByText('© 2026 Gambit')).toBeInTheDocument()
    })

    test('hover handlers restyle CTA and feature cards', () => {
        render(<Home />)
        const play = screen.getByText(/Play Now/).closest('a')!
        fireEvent.mouseEnter(play)
        expect(play.style.background).toBe('var(--accent-hover)')
        fireEvent.mouseLeave(play)
        expect(play.style.background).toBe('var(--accent)')
        const signup = screen.getByText('Create Account').closest('a')!
        fireEvent.mouseEnter(signup)
        expect(signup.style.borderColor).toBe('var(--border-accent)')
        expect(signup.style.background).toBe('var(--bg-hover)')
        fireEvent.mouseLeave(signup)
        expect(signup.style.borderColor).toBe('var(--border-strong)')
        const card = screen.getByText('Bullet Games').parentElement!
        fireEvent.mouseEnter(card)
        expect(card.style.transform).toBe('translateY(-2px)')
        expect(card.style.boxShadow).toBe('0 4px 20px var(--accent-glow)')
        fireEvent.mouseLeave(card)
        expect(card.style.transform).toBe('')
        expect(card.style.borderColor).toBe('var(--border)')
    })

    test('demo board plays the King\'s Gambit every 900 ms and resets 3 s after the last move', () => {
        jest.useFakeTimers()
        const { container } = render(<Home />)
        const start = pieces(container)
        expect(start).toBe('♜♞♝♛♚♝♞♜♟♟♟♟♟♟♟♟' + '.'.repeat(32) + '♙♙♙♙♙♙♙♙♖♘♗♕♔♗♘♖')
        expect(highlighted(container)).toEqual([])
        act(() => { jest.advanceTimersByTime(900) })
        // e2 = index 52, e4 = index 36
        expect(highlighted(container)).toEqual([36, 52])
        act(() => { jest.advanceTimersByTime(900 * 7) })
        expect(highlighted(container)).toEqual([30, 38]) // g5g4
        expect(pieces(container)).toBe('♜♞♝♛♚♝♞♜♟♟♟♟.♟.♟' + '.'.repeat(20) + '♙♟♟♙' + '.....♘..' + '♙♙♙♙..♙.' + '♖♘♗♕♔♗.♖')
        act(() => { jest.advanceTimersByTime(900 + 3000) })
        expect(pieces(container)).toBe(start)
        expect(highlighted(container)).toEqual([])
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

    test('loading shows a spinner; signed-out pushes /login and renders nothing', () => {
        profileState = { profile: null, loading: true, refetch: jest.fn() }
        const { container, rerender } = render(<SettingsPage />)
        expect(container.querySelector('.animate-spin')).not.toBeNull()
        profileState = { profile: null, loading: false, refetch: jest.fn() }
        rerender(<SettingsPage />)
        expect(container.innerHTML).toBe('')
        expect(push.mock.calls).toEqual([['/login']])
    })

    test('form is prefilled from the profile and saves trimmed values with PATCH', async () => {
        jest.useFakeTimers()
        render(<SettingsPage />)
        expect(screen.getByDisplayValue('Me')).toBeInTheDocument()
        expect(screen.getByDisplayValue('hi')).toBeInTheDocument()
        expect(screen.getByDisplayValue('India')).toBeInTheDocument()
        expect(screen.getByText('2/160')).toBeInTheDocument()
        expect(screen.getByText('Member since 2024')).toBeInTheDocument()
        fireEvent.change(screen.getByDisplayValue('Me'), { target: { value: '  New Name ' } })
        fireEvent.change(screen.getByDisplayValue('hi'), { target: { value: '   ' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
        await flush()
        expect(fetchMock.mock.calls).toEqual([['/api/profile/me', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ displayName: 'New Name', bio: null, country: 'India' }),
        }]])
        expect(profileState.refetch).toHaveBeenCalledTimes(1)
        expect(screen.getByRole('button', { name: 'Saved!' })).toBeInTheDocument()
        act(() => { jest.advanceTimersByTime(2500) })
        expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument()
    })

    test('save errors: API error text, fallback text, network error', async () => {
        render(<SettingsPage />)
        fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Too long' }, false))
        fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
        await flush()
        expect(screen.getByText('Too long')).toBeInTheDocument()
        fetchMock.mockResolvedValueOnce(jsonResponse({}, false))
        fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
        await flush()
        expect(screen.getByText('Failed to save')).toBeInTheDocument()
        fetchMock.mockRejectedValueOnce(new Error('x'))
        fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
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
        expect(screen.getByText('M')).toBeInTheDocument()
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

    test('account tab shows read-only username and rounded ratings (1200 fallback)', () => {
        render(<SettingsPage />)
        fireEvent.click(screen.getByRole('button', { name: 'Account' }))
        expect(screen.queryByText('Public Profile', { selector: 'h2' })).not.toBeInTheDocument()
        expect(screen.getByDisplayValue('me1')).toBeDisabled()
        const ratings = [...document.querySelectorAll('.grid.grid-cols-2 > div')].map(d => d.textContent)
        expect(ratings).toEqual(['Bullet1100', 'Blitz1201', 'Rapid1200', 'Classical1400'])
        fireEvent.click(screen.getAllByRole('button')[0])
        expect(back).toHaveBeenCalledTimes(1)
    })
})
