import { AWAY_AFTER_MS, PRESENCE_LABELS, presenceSets, presenceStatusOf } from '@/lib/presence/presenceStatus'

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

// F-161 (was: features/profile/model friendStatus(id, onlineIds, awayIds?), the F-104 slot): the
// Overview reads presence through presenceStatusOf and PresenceProvider's sets; same cases.
describe('friend status on the profile Overview [F-104, F-161]', () => {
    const sets = (away: string[] = []) => ({ present: new Set(['a', 'b']), away: new Set(away) })
    test('Online / Offline from presence; Away only when the away set says so', () => {
        expect(PRESENCE_LABELS[presenceStatusOf('a', sets())]).toBe('Online')
        expect(PRESENCE_LABELS[presenceStatusOf('z', sets())]).toBe('Offline')
        expect(PRESENCE_LABELS[presenceStatusOf(undefined, sets())]).toBe('Offline')
        expect(PRESENCE_LABELS[presenceStatusOf('b', sets(['b']))]).toBe('Away')
    })
})
