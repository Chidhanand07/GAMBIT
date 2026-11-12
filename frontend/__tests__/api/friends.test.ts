/** @jest-environment node */
jest.mock('next/headers', () => require('../helpers/routeHarness').nextHeadersMock)
jest.mock('@supabase/supabase-js', () => require('../helpers/routeHarness').supabaseJsMock)
jest.mock('@supabase/ssr', () => require('../helpers/routeHarness').supabaseSsrMock)

import { GET as listFriends } from '@/app/api/friends/route'
import { POST as sendRequest } from '@/app/api/friends/request/route'
import { GET as pending } from '@/app/api/friends/pending/route'
import { GET as status } from '@/app/api/friends/status/[username]/route'
import { PUT as respond, DELETE as unfriend } from '@/app/api/friends/[id]/route'
import { db, req, json, resetHarness, signInWithCookie, uid } from '../helpers/routeHarness'

beforeEach(() => {
    resetHarness()
    signInWithCookie(uid('me'))
})

describe('GET /api/friends', () => {
    const rows = [
        { id: uid('f1'), requester_id: uid('me'), addressee_id: uid('a'), requester: { id: uid('me') }, addressee: { id: uid('a'), username: 'alice' } },
        { id: uid('f2'), requester_id: uid('b'), addressee_id: uid('me'), requester: { id: uid('b'), username: 'bob' }, addressee: { id: uid('me') } },
        { id: uid('f3'), requester_id: uid('a'), addressee_id: uid('me'), requester: { id: uid('a'), username: 'alice' }, addressee: { id: uid('me') } },
        { id: uid('f4'), requester_id: uid('me'), addressee_id: uid('x'), requester: { id: uid('me') }, addressee: null },
    ]

    test('lists my accepted friends once each, whichever side sent the request', async () => {
        db.queue('friendships', { data: rows, error: null })
        const res = await json(await listFriends(req('/api/friends')))
        expect(res.body).toEqual([
            { id: uid('a'), username: 'alice', friendship_id: uid('f1') },
            { id: uid('b'), username: 'bob', friendship_id: uid('f2') },
        ])
        const call = db.callsFor('friendships')[0]
        expect(call.ops).toEqual(expect.arrayContaining([['or', `requester_id.eq.${uid('me')},addressee_id.eq.${uid('me')}`], ['eq', 'status', 'accepted']]))
    })

    test('?userId lists another user\'s friends (public profile)', async () => {
        await listFriends(req(`/api/friends?userId=${uid('other')}`))
        expect(db.callsFor('friendships')[0].ops).toContainEqual(['or', `requester_id.eq.${uid('other')},addressee_id.eq.${uid('other')}`])
    })

    test('signed out → 401 without querying (was: [] ) [S5]', async () => {
        resetHarness()
        expect((await listFriends(req('/api/friends'))).status).toBe(401)
        expect(db.calls).toEqual([])
    })

    test('database error → []', async () => {
        db.queue('friendships', { data: null, error: { message: 'x' } })
        expect((await json(await listFriends(req('/api/friends')))).body).toEqual([])
    })
})

describe('POST /api/friends/request', () => {
    const post = (body: unknown) => sendRequest(req('/api/friends/request', { method: 'POST', body }))

    test('400 without addressee_username', async () => {
        expect((await json(await post({}))).status).toBe(400)
    })

    test('404 for an unknown user', async () => {
        expect((await json(await post({ addressee_username: 'ghost' }))).status).toBe(404)
    })

    test('400 when befriending yourself', async () => {
        db.queue('profiles', { data: { id: uid('me') }, error: null })
        expect(await json(await post({ addressee_username: 'me' }))).toEqual({ status: 400, body: { error: 'Cannot friend yourself' } })
    })

    test('400 when already friends', async () => {
        db.queue('profiles', { data: { id: uid('bob') }, error: null })
        db.queue('friendships', { data: { id: uid('f'), status: 'accepted' }, error: null })
        expect(await json(await post({ addressee_username: 'bob' }))).toEqual({ status: 400, body: { error: 'Already friends' } })
    })

    test('an existing pending request is not duplicated', async () => {
        db.queue('profiles', { data: { id: uid('bob') }, error: null })
        db.queue('friendships', { data: { id: uid('f'), status: 'pending' }, error: null })
        expect((await json(await post({ addressee_username: 'bob' }))).body).toEqual({ success: true, already: true })
        expect(db.callsFor('friendships')).toHaveLength(1)
    })

    test('creates a pending request from me to them', async () => {
        db.queue('profiles', { data: { id: uid('bob') }, error: null })
        expect((await json(await post({ addressee_username: 'bob' }))).body).toEqual({ success: true })
        expect(db.op(db.callsFor('friendships')[1], 'insert')![0]).toEqual({ requester_id: uid('me'), addressee_id: uid('bob'), status: 'pending' })
    })

    test('a declined request can be sent again', async () => {
        db.queue('profiles', { data: { id: uid('bob') }, error: null })
        db.queue('friendships', { data: { id: uid('f'), status: 'declined' }, error: null }, { data: null, error: null })
        expect((await json(await post({ addressee_username: 'bob' }))).body).toEqual({ success: true })
    })
})

describe('GET /api/friends/status/[username]', () => {
    const get = () => status(req('/x'), { params: { username: 'bob' } })

    test.each([
        [{ status: 'accepted', requester_id: uid('me') }, 'friends'],
        [{ status: 'pending', requester_id: uid('me') }, 'pending_sent'],
        [{ status: 'pending', requester_id: uid('bob') }, 'pending_received'],
        [{ status: 'declined', requester_id: uid('bob') }, 'none'],
        [null, 'none'],
    ])('%j → %s', async (row, expected) => {
        db.queue('profiles', { data: { id: uid('bob') }, error: null })
        db.queue('friendships', { data: row, error: null })
        expect((await json(await get())).body).toEqual({ status: expected })
    })

    test('looking at my own profile → self', async () => {
        db.queue('profiles', { data: { id: uid('me') }, error: null })
        expect((await json(await get())).body).toEqual({ status: 'self' })
    })
})

describe('GET /api/friends/pending', () => {
    test('returns incoming pending requests addressed to me, newest first', async () => {
        db.queue('friendships', { data: [{ id: uid('r1') }], error: null })
        expect((await json(await pending())).body).toEqual([{ id: uid('r1') }])
        const call = db.callsFor('friendships')[0]
        expect(call.ops).toEqual(expect.arrayContaining([
            ['eq', 'addressee_id', uid('me')], ['eq', 'status', 'pending'], ['order', 'created_at', { ascending: false }],
        ]))
    })

    test('database error → []', async () => {
        db.queue('friendships', { data: null, error: { message: 'x' } })
        expect((await json(await pending())).body).toEqual([])
    })
})

describe('PUT/DELETE /api/friends/[id]', () => {
    test.each([['accept', 'accepted'], ['decline', 'declined']])('?action=%s sets status %s on a request addressed to me', async (action, newStatus) => {
        const res = await json(await respond(req(`/api/friends/f1?action=${action}`, { method: 'PUT' }), { params: { id: uid('f1') } }))
        expect(res.body).toEqual({ success: true })
        const call = db.callsFor('friendships')[0]
        expect(db.op(call, 'update')![0]).toEqual({ status: newStatus })
        expect(call.ops).toEqual(expect.arrayContaining([['eq', 'id', uid('f1')], ['eq', 'addressee_id', uid('me')]]))
    })

    test('an unknown action is rejected', async () => {
        const res = await respond(req(`/api/friends/${uid('f1')}?action=hack`, { method: 'PUT' }), { params: { id: uid('f1') } })
        expect(res.status).toBe(400)
        expect(db.calls).toEqual([])
    })

    test('database error → 400', async () => {
        db.queue('friendships', { data: null, error: { message: 'nope' } })
        const res = await respond(req(`/api/friends/${uid('f1')}?action=accept`, { method: 'PUT' }), { params: { id: uid('f1') } })
        expect(res.status).toBe(400)
    })

    test('unfriend only deletes a friendship I am part of', async () => {
        await unfriend(req(`/api/friends/${uid('f1')}`, { method: 'DELETE' }), { params: { id: uid('f1') } })
        const call = db.callsFor('friendships')[0]
        expect(db.op(call, 'delete')).toBeDefined()
        expect(call.ops).toEqual(expect.arrayContaining([['eq', 'id', uid('f1')], ['or', `requester_id.eq.${uid('me')},addressee_id.eq.${uid('me')}`]]))
    })
})
