/** @jest-environment node */
/**
 * F18: invite tokens draw each character uniformly from the 62-character alphabet.
 * `byte % 62` over 0..255 favours the first 8 characters (5 hits instead of 4), so bytes
 * from 248 up must be rejected and redrawn.
 */
import { newInvite } from '@/lib/server/privateGames'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/** Replays `bytes` across getRandomValues calls (then zeros). */
function feedBytes(bytes: number[]) {
    let next = 0
    return jest.spyOn(crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
        const view = array as unknown as Uint8Array
        for (let i = 0; i < view.length; i++) view[i] = next < bytes.length ? bytes[next++] : 0
        return array
    })
}

afterEach(() => jest.restoreAllMocks())

describe('newInvite token', () => {
    test('is 10 characters from the URL-safe alphabet', () => {
        const { token } = newInvite('g1')
        expect(token).toMatch(/^[A-Za-z0-9]{10}$/)
    })

    test('bytes 248-255 are rejected instead of folded onto A-H (no modulo bias)', () => {
        // 248..255 would map to A..H under `% 62`; 61 is '9', 62 is 'A', 247 is '9'.
        feedBytes([248, 249, 250, 251, 252, 253, 254, 255, 61, 62, 247, 1, 2, 3, 4, 5, 6, 7])
        expect(newInvite('g1').token).toBe('9A9BCDEFGH')
    })

    test('every character is reachable and none is favoured over 0..247', () => {
        const counts = new Map<string, number>()
        feedBytes(Array.from({ length: 248 }, (_, i) => i))
        let token = ''
        for (let i = 0; i < 25; i++) token += newInvite('g').token.slice(0, 10)
        for (const c of token.slice(0, 248)) counts.set(c, (counts.get(c) ?? 0) + 1)
        expect([...counts.keys()].sort()).toEqual([...ALPHABET].sort())
        expect(new Set(counts.values())).toEqual(new Set([4]))
    })
})
