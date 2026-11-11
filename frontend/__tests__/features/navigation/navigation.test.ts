import { hoverStyles } from '@/features/navigation/hover'
import { NAV_LINKS, isActivePath } from '@/features/navigation/navLinks'
import { getNotifications, markNotificationsRead } from '@/lib/api/notifications'

describe('isActivePath', () => {
    test('exact and nested paths are active; prefixes without a slash are not', () => {
        expect(isActivePath('/lobby', '/lobby')).toBe(true)
        expect(isActivePath('/lobby/x', '/lobby')).toBe(true)
        expect(isActivePath('/lobbyist', '/lobby')).toBe(false)
        expect(NAV_LINKS.map((l) => l.href)).toEqual(['/lobby', '/leaderboard', '/analysis'])
    })
})

describe('hoverStyles', () => {
    test('writes the enter/leave inline styles on currentTarget', () => {
        const el = document.createElement('a')
        const h = hoverStyles({ color: 'red', background: 'blue' }, { color: 'green', background: '' })
        h.onMouseEnter({ currentTarget: el } as any)
        expect(el.style.color).toBe('red')
        expect(el.style.background).toBe('blue')
        h.onMouseLeave({ currentTarget: el } as any)
        expect(el.style.color).toBe('green')
        expect(el.style.background).toBe('')
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
