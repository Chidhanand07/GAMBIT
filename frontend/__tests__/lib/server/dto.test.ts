/** @jest-environment node */
/**
 * lib/server/dto.ts [S8] (NX-04, NX-07 step 4): responses are built from an
 * allow-list, so a column added to a table later (or a secret one that exists
 * today) is never sent just because the query selected `*`.
 */
import { toGameDto, toPublicProfileDto } from '@/lib/server/dto'

const gameRow = {
    id: 'g1',
    white_id: 'w',
    black_id: 'b',
    time_control: '5+3',
    increment: 3,
    status: 'active',
    result: null,
    winner_id: null,
    pgn: null,
    fen: 'fen',
    final_fen: null,
    white_clock_ms: 1,
    black_clock_ms: 2,
    white_time_ms: 3,
    black_time_ms: 4,
    white_accuracy: 91.2,
    black_accuracy: 80,
    white_move_classifications: [{ ply: 1 }],
    black_move_classifications: [],
    critical_moments: [],
    is_rated: true,
    spectator_count: 0,
    started_at: 's',
    ended_at: null,
    created_at: 'c',
    white: { id: 'w', username: 'alice', rating_rapid: 1500 },
    black: { id: 'b', username: 'bob', rating_rapid: 1400 },
    // must never leave the server:
    invite_token: 'SECRETTOKN',
    invite_expires_at: '2026-01-01T00:00:00Z',
    clock_deadline: 'internal',
    some_future_internal_column: 'x',
}

describe('toGameDto', () => {
    test('keeps what the game and review pages read', () => {
        const dto = toGameDto(gameRow)
        expect(dto).toMatchObject({
            id: 'g1',
            white_id: 'w',
            black_id: 'b',
            time_control: '5+3',
            status: 'active',
            fen: 'fen',
            is_rated: true,
            white_move_classifications: [{ ply: 1 }],
            white: { id: 'w', username: 'alice', rating_rapid: 1500 },
            black: { id: 'b', username: 'bob', rating_rapid: 1400 },
        })
    })

    test.each(['invite_token', 'invite_expires_at', 'clock_deadline', 'some_future_internal_column'])(
        'never includes %s',
        (key) => {
            expect(toGameDto(gameRow)).not.toHaveProperty(key)
            expect(JSON.stringify(toGameDto(gameRow))).not.toContain('SECRETTOKN')
        },
    )

    test('embedded players are reduced to their public summary', () => {
        const dto = toGameDto({ ...gameRow, white: { ...gameRow.white, email: 'a@b.c', sex: 'f', rating_vol: 0.06 } })
        expect(dto.white).toEqual({ id: 'w', username: 'alice', rating_rapid: 1500 })
    })

    test('a missing player stays null; missing columns are simply absent', () => {
        const dto = toGameDto({ id: 'g1', white: null })
        expect(dto).toEqual({ id: 'g1', white: null })
    })
})

describe('toPublicProfileDto', () => {
    const row = {
        id: 'u1',
        username: 'alice',
        display_name: 'Alice',
        avatar_url: null,
        bio: 'hi',
        country: 'IN',
        rating_rapid: 1500,
        rating_blitz: 1400,
        rating_bullet: 1300,
        rating_classical: 1200,
        games_played: 10,
        wins: 5,
        losses: 3,
        draws: 2,
        created_at: 'c',
        peak_rapid: 1550,
        // private or internal:
        sex: 'f',
        is_public: true,
        rating_rd: 80,
        rating_vol: 0.06,
        email: 'a@b.c',
    }

    test('keeps the public profile fields', () => {
        expect(toPublicProfileDto(row)).toMatchObject({ id: 'u1', username: 'alice', rating_rapid: 1500, wins: 5, peak_rapid: 1550 })
    })

    test.each(['sex', 'is_public', 'rating_rd', 'rating_vol', 'email'])('never includes %s', (key) => {
        expect(toPublicProfileDto(row)).not.toHaveProperty(key)
    })
})
