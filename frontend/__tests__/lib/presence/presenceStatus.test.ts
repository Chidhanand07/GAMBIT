import { AWAY_AFTER_MS, presenceSets, presenceStatusOf } from '@/lib/presence/presenceStatus'

describe('presence status [LIVE-2]', () => {
    test('away only when every tab of a user reports away; a tab without a status is online', () => {
        const sets = presenceSets({
            a: [{ status: 'online' }],
            b: [{ status: 'away' }],
            c: [{ status: 'away' }, { status: 'online' }],
            d: [{}],
            e: [],
        })
        expect([...sets.present].sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
        expect([...sets.away]).toEqual(['b'])
    })

    test('status of an id: online, away or offline', () => {
        const sets = { present: new Set(['a', 'b']), away: new Set(['b']) }
        expect(presenceStatusOf('a', sets)).toBe('online')
        expect(presenceStatusOf('b', sets)).toBe('away')
        expect(presenceStatusOf('z', sets)).toBe('offline')
        expect(presenceStatusOf(undefined, sets)).toBe('offline')
    })

    test('a named idle threshold of five minutes', () => {
        expect(AWAY_AFTER_MS).toBe(300_000)
    })
})
