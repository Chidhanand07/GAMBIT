/**
 * lib/socket/connection.ts — the realtime connection authenticates in the
 * handshake with a fresh Supabase access token [S2] (NODE-10).
 */
const ioMock = jest.fn()
jest.mock('socket.io-client', () => ({ io: (...args: unknown[]) => ioMock(...args) }))

import { createGameSocket, UNAUTHORIZED_RETRY_MS } from '@/lib/socket/connection'

type Handler = (arg?: unknown) => void

function fakeIoSocket() {
    const handlers = new Map<string, Handler>()
    return {
        on: jest.fn((event: string, h: Handler) => handlers.set(event, h)),
        emit: jest.fn(),
        connect: jest.fn(),
        disconnect: jest.fn(),
        fire: (event: string, arg?: unknown) => handlers.get(event)?.(arg),
    }
}

let fake: ReturnType<typeof fakeIoSocket>
beforeEach(() => {
    jest.useFakeTimers()
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    fake = fakeIoSocket()
    ioMock.mockReset().mockReturnValue(fake)
})
afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
})

/** Run the `auth` option the way socket.io does on every (re)connect attempt. */
function handshakeAuth(): Promise<unknown> {
    const { auth } = ioMock.mock.calls[0][1]
    return new Promise((resolve) => auth(resolve))
}

test('connects to the given URL and never emits `authenticate`', () => {
    createGameSocket({ url: 'http://rt.test', getToken: async () => 'tok' })
    expect(ioMock.mock.calls[0][0]).toBe('http://rt.test')
    expect(fake.emit).not.toHaveBeenCalled()
})

test('the handshake sends the current access token, read again on every attempt', async () => {
    const getToken = jest.fn().mockResolvedValueOnce('first-token').mockResolvedValueOnce('refreshed-token')
    createGameSocket({ url: 'http://rt.test', getToken })
    expect(await handshakeAuth()).toEqual({ token: 'first-token' })
    expect(await handshakeAuth()).toEqual({ token: 'refreshed-token' })
    expect(getToken).toHaveBeenCalledTimes(2)
})

test.each([
    ['no session', async () => null],
    [
        'a failing session lookup',
        async () => {
            throw new Error('storage unavailable')
        },
    ],
])('with %s the handshake carries no token (the server then refuses it)', async (_name, getToken) => {
    createGameSocket({ url: 'http://rt.test', getToken })
    expect(await handshakeAuth()).toEqual({})
})

test('an "unauthorized" refusal is retried later with a fresh handshake', () => {
    createGameSocket({ url: 'http://rt.test', getToken: async () => 'tok' })
    fake.fire('connect_error', new Error('unauthorized'))
    expect(fake.connect).not.toHaveBeenCalled()
    jest.advanceTimersByTime(UNAUTHORIZED_RETRY_MS)
    expect(fake.connect).toHaveBeenCalledTimes(1)
})

test('other connection errors are left to socket.io’s own reconnection', () => {
    createGameSocket({ url: 'http://rt.test', getToken: async () => 'tok' })
    fake.fire('connect_error', new Error('xhr poll error'))
    jest.advanceTimersByTime(UNAUTHORIZED_RETRY_MS * 2)
    expect(fake.connect).not.toHaveBeenCalled()
})

test('close() disconnects and cancels a pending retry', () => {
    const connection = createGameSocket({ url: 'http://rt.test', getToken: async () => 'tok' })
    fake.fire('connect_error', new Error('unauthorized'))
    connection.close()
    jest.advanceTimersByTime(UNAUTHORIZED_RETRY_MS * 2)
    expect(fake.disconnect).toHaveBeenCalledTimes(1)
    expect(fake.connect).not.toHaveBeenCalled()
})
