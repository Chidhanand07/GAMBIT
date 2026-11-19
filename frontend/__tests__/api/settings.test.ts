/** @jest-environment node */
// SETTINGS-PREFS (ADR F-140): GET/PATCH /api/settings, and the privacy and notification
// preferences the other route handlers enforce.
jest.mock('next/headers', () => require('../helpers/routeHarness').nextHeadersMock)
jest.mock('@supabase/supabase-js', () => require('../helpers/routeHarness').supabaseJsMock)
jest.mock('@supabase/ssr', () => require('../helpers/routeHarness').supabaseSsrMock)

import { GET, PATCH } from '@/app/api/settings/route'
import { GET as liveGames } from '@/app/api/games/live/route'
import { POST as sendFriendRequest } from '@/app/api/friends/request/route'
import { db, forgeCookie, json, req, resetHarness, signInWithCookie, supabaseJsMock, supabaseSsrMock, uid } from '../helpers/routeHarness'

beforeEach(() => {
    resetHarness()
    jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

const ROW = {
    play: { boardTheme: 'slate', bogus: 1 },
    notify_challenges: false,
    notify_friend_requests: true,
    notify_game_results: true,
    notify_your_turn: false,
    notify_email_digest: true,
    notify_browser: false,
    show_online: false,
    challenge_policy: 'friends',
    appear_in_search: true,
    show_on_leaderboard: false,
    allow_spectators: true,
    email_on_new_sign_in: false,
}

const patch = (body: unknown) => PATCH(req('/api/settings', { method: 'PATCH', body }))

describe('GET /api/settings', () => {
    test('signed out (or a forged cookie) → 401, nothing read', async () => {
        expect((await GET()).status).toBe(401)
        forgeCookie(uid('me'))
        expect((await GET()).status).toBe(401)
        expect(db.calls).toEqual([])
    })

    test('no row yet → the defaults with stored: false', async () => {
        signInWithCookie(uid('me'))
        const { status, body } = await json(await GET())
        expect(status).toBe(200)
        expect(body).toMatchObject({
            stored: false,
            play: {},
            notifications: { challenges: true, emailDigest: false, browser: false },
            privacy: { showOnline: true, challengePolicy: 'everyone', showOnLeaderboard: true, allowSpectators: true },
            security: { emailOnNewSignIn: true },
        })
        expect(db.callsFor('user_preferences')[0].ops).toContainEqual(['eq', 'user_id', uid('me')])
    })

    test('a stored row is mapped column by column; unknown play keys are dropped', async () => {
        signInWithCookie(uid('me'))
        db.queue('user_preferences', { data: ROW, error: null })
        const { body } = await json(await GET())
        expect(body.stored).toBe(true)
        expect(body.play).toMatchObject({ boardTheme: 'slate', showCoordinates: false })
        expect(body.play).not.toHaveProperty('bogus')
        expect(body.notifications).toEqual({ challenges: false, friendRequests: true, gameResults: true, yourTurn: false, emailDigest: true, browser: false })
        expect(body.privacy).toEqual({ showOnline: false, challengePolicy: 'friends', appearInSearch: true, showOnLeaderboard: false, allowSpectators: true })
        expect(body.security).toEqual({ emailOnNewSignIn: false })
    })

    test('the read runs on the caller\'s session client (RLS), never the service-role key', async () => {
        signInWithCookie(uid('me'))
        supabaseJsMock.createClient.mockClear()
        await GET()
        expect(supabaseJsMock.createClient).not.toHaveBeenCalled()
        expect(supabaseSsrMock.createServerClient).toHaveBeenCalled()
    })

    test('database error → 500 without the database message', async () => {
        signInWithCookie(uid('me'))
        db.queue('user_preferences', { data: null, error: { message: 'relation secret' } })
        const res = await json(await GET())
        expect(res).toEqual({ status: 500, body: { error: 'Could not load settings' } })
    })
})

describe('PATCH /api/settings', () => {
    test('signed out → 401, nothing written', async () => {
        expect((await patch({ privacy: { showOnline: false } })).status).toBe(401)
        expect(db.calls).toEqual([])
    })

    test.each([
        [{ privacy: { challengePolicy: 'strangers' } }],
        [{ notifications: { challenges: 'yes' } }],
        [{ play: 'maple' }],
        [{ play: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`k${i}`, true])) }],
        ['{nope'],
    ])('invalid body %p → 400, nothing written', async (body) => {
        signInWithCookie(uid('me'))
        expect((await patch(body)).status).toBe(400)
        expect(db.callsFor('user_preferences')).toHaveLength(0)
    })

    test('a body with nothing to change → 400', async () => {
        signInWithCookie(uid('me'))
        expect((await patch({ user_id: uid('other'), notifications: {} })).status).toBe(400)
        expect(db.callsFor('user_preferences')).toHaveLength(0)
    })

    test('updates only the sent preference columns of MY row; never user_id or timestamps', async () => {
        signInWithCookie(uid('me'))
        db.queue('user_preferences', { data: [ROW], error: null })
        const res = await json(await patch({
            user_id: uid('other'),
            updated_at: '2000-01-01',
            notifications: { gameResults: false },
            privacy: { challengePolicy: 'nobody', allowSpectators: false },
        }))
        expect(res.status).toBe(200)
        const call = db.callsFor('user_preferences')[0]
        expect(db.op(call, 'update')![0]).toEqual({ notify_game_results: false, challenge_policy: 'nobody', allow_spectators: false })
        expect(call.ops).toContainEqual(['eq', 'user_id', uid('me')])
        expect(db.callsFor('user_preferences')).toHaveLength(1)
    })

    test('play is normalised before it is stored (bad values → defaults, unknown keys dropped)', async () => {
        signInWithCookie(uid('me'))
        db.queue('user_preferences', { data: [ROW], error: null })
        await patch({ play: { boardTheme: 'neon', autoQueen: false, extra: 'x' } })
        const written = db.op(db.callsFor('user_preferences')[0], 'update')![0]
        expect(written.play).toMatchObject({ boardTheme: 'maple', autoQueen: false })
        expect(written.play).not.toHaveProperty('extra')
    })

    test('first save: no row to update → INSERT with my user id', async () => {
        signInWithCookie(uid('me'))
        db.queue('user_preferences', { data: [], error: null }, { data: ROW, error: null })
        const res = await json(await patch({ security: { emailOnNewSignIn: false } }))
        expect(res.status).toBe(200)
        expect(db.op(db.callsFor('user_preferences')[1], 'insert')![0]).toEqual({ user_id: uid('me'), email_on_new_sign_in: false })
    })

    test('two first saves at once: the INSERT that loses the race retries the UPDATE', async () => {
        signInWithCookie(uid('me'))
        db.queue(
            'user_preferences',
            { data: [], error: null },
            { data: null, error: { code: '23505', message: 'duplicate key' } },
            { data: ROW, error: null },
        )
        expect((await patch({ privacy: { showOnline: false } })).status).toBe(200)
        const calls = db.callsFor('user_preferences')
        expect(calls).toHaveLength(3)
        expect(db.op(calls[2], 'update')![0]).toEqual({ show_online: false })
    })

    test('the write runs on the session client (RLS + column grants), never the service-role key', async () => {
        signInWithCookie(uid('me'))
        supabaseJsMock.createClient.mockClear()
        db.queue('user_preferences', { data: [ROW], error: null })
        await patch({ privacy: { showOnline: false } })
        expect(supabaseJsMock.createClient).not.toHaveBeenCalled()
    })

    test('database error → 500', async () => {
        signInWithCookie(uid('me'))
        db.queue('user_preferences', { data: null, error: { message: 'x' } })
        expect((await patch({ privacy: { showOnline: false } })).status).toBe(500)
    })
})

describe('privacy: "Allow spectators" off hides live games (GET /api/games/live)', () => {
    const game = (id: string, white: string, black: string) => ({
        id: uid(id),
        white_id: uid(white),
        black_id: uid(black),
        time_control: '10+0',
        fen: null,
        started_at: '2026-11-16T11:00:00Z',
        white: { username: white, rating_rapid: 1500 },
        black: { username: black, rating_rapid: 1400 },
    })

    test('a game with a player who turned spectators off is not listed; the ids never leave the server', async () => {
        db.signIn(uid('me'))
        db.queue('games', { data: [game('g1', 'alice', 'bob'), game('g2', 'carol', 'dave')], error: null })
        db.queue('game_invites', { data: [], error: null })
        db.queue('user_preferences', { data: [{ user_id: uid('bob') }], error: null })
        const { body } = await json(await liveGames(req('/api/games/live')))
        expect(body.map((g: { id: string }) => g.id)).toEqual([uid('g2')])
        expect(body[0]).not.toHaveProperty('white_id')
        const prefs = db.callsFor('user_preferences')[0]
        expect(prefs.ops).toContainEqual(['eq', 'allow_spectators', false])
        expect(db.op(prefs, 'in')![1]).toEqual(expect.arrayContaining([uid('alice'), uid('bob'), uid('carol'), uid('dave')]))
    })

    test('fail closed: when the spectator check fails nothing is listed', async () => {
        db.signIn(uid('me'))
        db.queue('games', { data: [game('g1', 'alice', 'bob')], error: null })
        db.queue('game_invites', { data: [], error: null })
        db.queue('user_preferences', { data: null, error: { message: 'down' } })
        expect((await json(await liveGames(req('/api/games/live')))).body).toEqual([])
    })
})

describe('notifications: "Friend requests" (POST /api/friends/request)', () => {
    const post = () => sendFriendRequest(req('/api/friends/request', { method: 'POST', body: { addressee_username: 'bob' } }))

    test('with the default (no row) the addressee gets a friend_request notification naming me', async () => {
        signInWithCookie(uid('me'))
        db.queue('profiles', { data: { id: uid('bob') }, error: null }, { data: { username: 'me1' }, error: null })
        expect((await post()).status).toBe(200)
        const [row] = db.op(db.callsFor('notifications')[0], 'insert')!
        expect(row).toEqual({ user_id: uid('bob'), type: 'friend_request', payload: { from_user_id: uid('me'), from_username: 'me1' }, read: false })
        expect(db.callsFor('user_preferences')[0].ops).toContainEqual(['eq', 'user_id', uid('bob')])
    })

    test('turned off: no notification, the request is still stored', async () => {
        signInWithCookie(uid('me'))
        db.queue('profiles', { data: { id: uid('bob') }, error: null })
        db.queue('user_preferences', { data: { notify_friend_requests: false }, error: null })
        expect((await json(await post())).body).toEqual({ success: true })
        expect(db.callsFor('friendships')).toHaveLength(2)
        expect(db.callsFor('notifications')).toHaveLength(0)
    })

    test('the preference cannot be read: no notification (never one the user may have turned off)', async () => {
        signInWithCookie(uid('me'))
        db.queue('profiles', { data: { id: uid('bob') }, error: null })
        db.queue('user_preferences', { data: null, error: { message: 'down' } })
        expect((await post()).status).toBe(200)
        expect(db.callsFor('notifications')).toHaveLength(0)
    })
})

describe('gameplay switches for the game server (ADR F-146)', () => {
    test('premoves / allowTakebacks: off by default, stored as their own columns', async () => {
        signInWithCookie(uid('me'))
        expect((await json(await GET())).body.gameplay).toEqual({ premoves: false, allowTakebacks: false })
        db.queue('user_preferences', { data: [{ ...ROW, premoves: true, allow_takebacks: false }], error: null })
        const res = await json(await patch({ gameplay: { premoves: true } }))
        expect(db.op(db.callsFor('user_preferences')[1], 'update')![0]).toEqual({ premoves: true })
        expect(res.body.gameplay).toEqual({ premoves: true, allowTakebacks: false })
    })
})

describe('the Gameplay card writes the columns the game server reads [F-166]', () => {
    test('play.premoves / play.allowTakebacks are stored in premoves / allow_takebacks, not in the play object', async () => {
        signInWithCookie(uid('me'))
        db.queue('user_preferences', { data: [{ ...ROW, premoves: true, allow_takebacks: true }], error: null })
        await patch({ play: { premoves: true, allowTakebacks: true, autoQueen: false } })
        const update = db.op(db.callsFor('user_preferences')[0], 'update')![0] as Record<string, unknown>
        expect(update).toMatchObject({ premoves: true, allow_takebacks: true })
        expect(update.play).not.toHaveProperty('premoves')
        expect(update.play).not.toHaveProperty('allowTakebacks')
        expect(update.play).toMatchObject({ autoQueen: false })
    })

    test('the play settings show the stored columns, whatever an old play object says', async () => {
        signInWithCookie(uid('me'))
        db.queue('user_preferences', { data: { ...ROW, play: { premoves: false, allowTakebacks: false }, premoves: true, allow_takebacks: true }, error: null })
        const { body } = await json(await GET())
        expect(body.play).toMatchObject({ premoves: true, allowTakebacks: true })
        expect(body.gameplay).toEqual({ premoves: true, allowTakebacks: true })
    })

    test('an explicit gameplay section in the same PATCH wins over the play copy', async () => {
        signInWithCookie(uid('me'))
        await patch({ play: { premoves: true }, gameplay: { premoves: false } })
        expect(db.op(db.callsFor('user_preferences')[0], 'update')![0]).toMatchObject({ premoves: false })
    })
})
