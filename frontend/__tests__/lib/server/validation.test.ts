/** @jest-environment node */
/**
 * lib/server/validation.ts + lib/server/filters.ts [S7] (NX-07, NODE-08):
 * every route param, query value and body is parsed by a zod schema, and
 * PostgREST `.or()` filter strings are built only from validated UUIDs.
 */
import { z } from 'zod'
import { betweenUsersFilter, eitherSideFilter, participantFilter } from '@/lib/server/filters'
import { parseInput, parseJsonBody, schemas } from '@/lib/server/validation'

const UUID = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

/** PostgREST filter text an attacker could smuggle through an unvalidated id. */
const INJECTIONS = [
    `${UUID},status.eq.pending`,
    `${UUID}),or(id.neq.${UUID}`,
    'x,addressee_id.not.is.null',
    '*',
    `${UUID} `,
    '',
    'me',
    "' OR 1=1 --",
]

describe('uuid', () => {
    test('accepts a UUID', () => {
        expect(schemas.uuid.safeParse(UUID).success).toBe(true)
    })

    test.each(INJECTIONS)('rejects %p', (value) => {
        expect(schemas.uuid.safeParse(value).success).toBe(false)
    })

    // zod 4's uuid() also checks the RFC 9562 version/variant digits; zod 3's did not. The
    // schema keeps the zod 3 rule (any 8-4-4-4-12 hex id) so no stored id stops matching (F-094).
    test.each(['12345678-1234-1234-1234-123456789012', 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE'])(
        'accepts the non-RFC hex id %p, as under zod 3',
        (value) => {
            expect(schemas.uuid.safeParse(value).success).toBe(true)
            expect(participantFilter(value)).toBe(`white_id.eq.${value},black_id.eq.${value}`)
        },
    )
})

describe('filter builders only accept UUIDs', () => {
    test('produce the same filter text as before for valid ids', () => {
        expect(participantFilter(UUID)).toBe(`white_id.eq.${UUID},black_id.eq.${UUID}`)
        expect(eitherSideFilter(UUID)).toBe(`requester_id.eq.${UUID},addressee_id.eq.${UUID}`)
        expect(betweenUsersFilter(UUID, OTHER)).toBe(
            `and(requester_id.eq.${UUID},addressee_id.eq.${OTHER}),and(requester_id.eq.${OTHER},addressee_id.eq.${UUID})`,
        )
    })

    test.each(INJECTIONS)('throw instead of interpolating %p', (value) => {
        expect(() => participantFilter(value)).toThrow('not a UUID')
        expect(() => eitherSideFilter(value)).toThrow('not a UUID')
        expect(() => betweenUsersFilter(UUID, value)).toThrow('not a UUID')
        expect(() => betweenUsersFilter(value, UUID)).toThrow('not a UUID')
    })
})

describe('usernames', () => {
    test.each(['bob', 'Bob_99', 'a', 'first.last', 'dash-ed'])('lookup accepts %p', (value) => {
        expect(schemas.usernameParam.safeParse(value).success).toBe(true)
    })

    test.each(['', 'a b', 'a,b', 'a(b)', 'a"b', 'x'.repeat(41), 'a/b', 'a%b', 'bob\n'])('lookup rejects %p', (value) => {
        expect(schemas.usernameParam.safeParse(value).success).toBe(false)
    })

    test('a NEW username is letters, digits and underscores, 3 to 20 characters', () => {
        expect(schemas.newUsername.safeParse('new_user1').success).toBe(true)
        for (const bad of ['ab', 'x'.repeat(21), 'first.last', 'dash-ed', 'sp ace', '']) {
            expect(schemas.newUsername.safeParse(bad).success).toBe(false)
        }
    })
})

describe('pagination', () => {
    const page = (limit: string | null, offset: string | null) => schemas.gamesPage.safeParse({ limit, offset })

    test('defaults: limit 15, offset 0', () => {
        expect(page(null, null)).toMatchObject({ success: true, data: { limit: 15, offset: 0 } })
    })

    // zod 4 rejects an absent object key unless its schema is optional (F-094).
    test('absent keys take the defaults too', () => {
        expect(schemas.gamesPage.safeParse({})).toMatchObject({ success: true, data: { limit: 15, offset: 0 } })
        expect(schemas.gamesPage.safeParse({ offset: '5' })).toMatchObject({ success: true, data: { limit: 15, offset: 5 } })
    })

    test('limit is capped at 50', () => {
        expect(page('500', '10')).toMatchObject({ success: true, data: { limit: 50, offset: 10 } })
    })

    test.each([
        ['abc', '0'],
        ['10', 'NaN'],
        ['0', '0'],
        ['-5', '0'],
        ['10', '-1'],
        ['1.5', '0'],
        ['10', '1e9'],
        ['10', '100001'],
    ])('limit=%p offset=%p is rejected (was: NaN reached the query)', (limit, offset) => {
        expect(page(limit, offset).success).toBe(false)
    })
})

describe('parseInput / parseJsonBody', () => {
    test('valid input → ok with the parsed data', () => {
        expect(parseInput(schemas.uuid, UUID)).toEqual({ ok: true, data: UUID })
    })

    test('invalid input → a 400 response with the given message and no echo of the input', async () => {
        const result = parseInput(schemas.uuid, `${UUID},status.eq.pending`, 'Invalid id')
        expect(result.ok).toBe(false)
        if (result.ok) return
        expect(result.response.status).toBe(400)
        const text = await result.response.text()
        expect(JSON.parse(text)).toEqual({ error: 'Invalid id' })
        expect(text).not.toContain('status.eq')
    })

    const post = (body: string) => new Request('http://localhost/x', { method: 'POST', body })
    const shape = z.object({ name: z.string() })

    test('body: parsed JSON that matches the schema', async () => {
        expect(await parseJsonBody(post('{"name":"x","extra":1}'), shape)).toEqual({ ok: true, data: { name: 'x' } })
    })

    test.each([
        ['malformed JSON', '{not json'],
        ['empty body', ''],
        ['a JSON null', 'null'],
        ['an array', '[]'],
        ['the wrong type', '{"name":5}'],
    ])('body: %s → 400, never a throw', async (_name, body) => {
        const result = await parseJsonBody(post(body), shape)
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.response.status).toBe(400)
    })
})
