import { NAV_LINKS, isActivePath, navStateFor } from '@/features/navigation/navLinks'
import { speedLabel, timeAgo, toHeaderNotification } from '@/features/navigation/notificationView'
import { getNotifications, markNotificationsRead } from '@/lib/api/notifications'

describe('isActivePath', () => {
    test('exact and nested paths are active; prefixes without a slash are not', () => {
        expect(isActivePath('/lobby', '/lobby')).toBe(true)
        expect(isActivePath('/lobby/x', '/lobby')).toBe(true)
        expect(isActivePath('/lobbyist', '/lobby')).toBe(false)
        expect(NAV_LINKS.map((l) => l.href)).toEqual(['/lobby', '/leaderboard', '/analysis'])
    })
})

// Replaces the hoverStyles test: hovers are CSS now (app/globals.css); the header's state comes from here.
describe('navStateFor', () => {
    test('a section path parks the pill under its link', () => {
        expect(navStateFor('/lobby')).toMatchObject({ current: 'play', links: NAV_LINKS })
        expect(navStateFor('/leaderboard').current).toBe('leaderboard')
        expect(navStateFor('/analysis/abc').current).toBe('analysis')
    })

    test('other paths have no current link; landing and auth hide the pill, the rest idle', () => {
        expect(navStateFor('/profile/me')).toMatchObject({ current: null, rest: 'idle' })
        expect(navStateFor('/settings')).toMatchObject({ current: null, rest: 'idle' })
        expect(navStateFor('/game/g1')).toMatchObject({ current: null, rest: 'idle' })
        for (const path of ['/', '/login', '/signup', '/reset-password'])
            expect(navStateFor(path)).toMatchObject({ current: null, rest: 'none' })
    })
})

describe('notification rows', () => {
    const NOW = Date.parse('2026-11-16T12:00:00Z')
    const ago = (ms: number) => new Date(NOW - ms).toISOString()

    test('timeAgo buckets: just now, minutes, hours, days; unreadable dates give null', () => {
        expect(timeAgo(ago(30_000), NOW)).toBe('just now')
        expect(timeAgo(ago(2 * 60_000), NOW)).toBe('2m ago')
        expect(timeAgo(ago(60 * 60_000), NOW)).toBe('1h ago')
        expect(timeAgo(ago(3 * 24 * 60 * 60_000), NOW)).toBe('3d ago')
        expect(timeAgo(ago(-5_000), NOW)).toBe('just now')
        expect(timeAgo('', NOW)).toBeNull()
    })

    test('speedLabel names the speed bucket and shows minutes+increment', () => {
        expect(speedLabel('3+0')).toBe('Blitz 3+0')
        expect(speedLabel('10')).toBe('Rapid 10+0')
        expect(speedLabel('1+1')).toBe('Bullet 1+1')
    })

    test('title falls back payload.message → message → type title → raw type; detail joins what is known', () => {
        const base = { id: 'n', user_id: 'u', read: false, created_at: ago(2 * 60_000) }
        expect(toHeaderNotification({ ...base, type: 'challenge', payload: { message: 'Hi' }, message: 'x' }, NOW))
            .toEqual({ id: 'n', title: 'Hi', detail: '2m ago', unread: true })
        expect(toHeaderNotification({ ...base, type: 'challenge', payload: null, message: 'Top' }, NOW).title).toBe('Top')
        expect(toHeaderNotification({ ...base, type: 'friend_request', payload: {} }, NOW).title).toBe('Friend request')
        expect(toHeaderNotification({ ...base, type: 'something_else', payload: null }, NOW).title).toBe('something_else')
        const challenge = toHeaderNotification(
            { ...base, read: true, type: 'challenge', payload: { from_username: 'chiru', time_control: '3+0' } },
            NOW,
        )
        expect(challenge).toMatchObject({ title: 'New challenge', detail: 'chiru · Blitz 3+0 · 2m ago', unread: false })
        expect(toHeaderNotification({ ...base, created_at: '', type: 'challenge', payload: null }, NOW).detail).toBeNull()
    })
})

describe('notifications api', () => {
    test('GET without options; PUT read', async () => {
        const fetchMock = jest.fn(async () => ({ ok: true }))
        ;(global as any).fetch = fetchMock
        await getNotifications()
        await markNotificationsRead()
        expect(fetchMock.mock.calls).toEqual([['/api/notifications'], ['/api/notifications/read', { method: 'PUT' }]])
    })
})
