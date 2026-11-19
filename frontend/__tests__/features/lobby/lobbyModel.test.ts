import { categoryRating, liveGameLabel, selectionName, selectionSummary } from '@/features/lobby/lobbyModel'
import { toLobbyFriends } from '@/features/lobby/hooks/useLobbyFriends'

describe('selectionSummary', () => {
    test.each([
        ['bullet', 'Bullet · 1 min'],
        ['blitz', 'Blitz · 3 min'],
        ['rapid', 'Rapid · 10 min'],
        ['classical', 'Classical · 30 min'],
        ['daily', 'Daily · 1 day/move'],
    ] as const)('%s → %s', (id, text) => expect(selectionSummary(id, 7, 2)).toBe(text))

    test('custom shows the sliders', () => expect(selectionSummary('custom', 12, 5)).toBe('Custom · 12+5'))
})

test('selectionName capitalises the id', () => {
    expect(selectionName('blitz')).toBe('Blitz')
    expect(selectionName('custom')).toBe('Custom')
})

describe('categoryRating', () => {
    const ratings = { rating_bullet: 1001.5, rating_blitz: 1433.6, rating_rapid: 1501.2, rating_classical: null }
    test.each([
        ['1+0', 'Bullet rating', 1002],
        ['3+0', 'Blitz rating', 1434],
        ['12+5', 'Rapid rating', 1501],
        ['1440+0', 'Classical rating', 1200],
    ])('%s → %s %s', (tc, label, rating) => {
        expect(categoryRating(tc, ratings)).toMatchObject({ label, rating })
    })
})

test('liveGameLabel', () => expect(liveGameLabel('blitz', '3+2')).toBe('Blitz 3+2'))

test('toLobbyFriends: presence from the shared sets, online then away then offline, by name, rounded rapid rating', () => {
    const friends = [
        { id: 'b', username: 'bea', rating_rapid: 1300.6, friendship_id: '1' },
        { id: 'c', username: 'cal', display_name: 'Cal', friendship_id: '2' },
        { id: 'a', username: 'ann', rating_rapid: 1100, friendship_id: '3' },
        { id: 'd', username: 'dan', rating_rapid: 1000, friendship_id: '4' },
    ]
    const presence = { present: new Set(['c', 'd']), away: new Set(['d']) }
    expect(toLobbyFriends(friends, presence)).toEqual([
        { username: 'cal', display_name: 'Cal', avatar_url: null, rating: 1200, status: 'online' },
        { username: 'dan', display_name: null, avatar_url: null, rating: 1000, status: 'away' },
        { username: 'ann', display_name: null, avatar_url: null, rating: 1100, status: 'offline' },
        { username: 'bea', display_name: null, avatar_url: null, rating: 1301, status: 'offline' },
    ])
})

// Stacking (was: an online-id Set as the second argument): presence is the shared sets (F-131).
const NOBODY = { present: new Set<string>(), away: new Set<string>() }

test('toLobbyFriends: the rating is the one of the selected pool [F-125]', () => {
    const friends = [{ id: 'b', username: 'bea', rating_rapid: 1300, rating_blitz: 1239.6, rating_bullet: null, friendship_id: '1' }]
    expect(toLobbyFriends(friends, NOBODY, 'blitz')[0].rating).toBe(1240)
    expect(toLobbyFriends(friends, NOBODY, 'bullet')[0].rating).toBe(1200)
    expect(toLobbyFriends(friends, NOBODY, 'rapid')[0].rating).toBe(1300)
})
