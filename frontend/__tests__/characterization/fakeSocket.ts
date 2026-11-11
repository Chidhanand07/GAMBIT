/**
 * A stand-in for the socket.io client returned by `useSocket()`.
 * Records every emit and lets a test play the server by firing events
 * at whatever handlers the page has registered with `on`.
 */
import { act } from '@testing-library/react'

type Handler = (payload?: any) => void

export interface FakeSocket {
    emit: jest.Mock
    on: jest.Mock
    off: jest.Mock
    /** Fire a server -> client event at every registered handler. */
    serverSends: (event: string, payload?: any) => void
    /** Events that currently have at least one handler registered. */
    listenedEvents: () => string[]
    /** All emits of one event name, payloads only. */
    emitted: (event: string) => any[]
    reset: () => void
}

export function createFakeSocket(): FakeSocket {
    const handlers = new Map<string, Set<Handler>>()
    const socket: FakeSocket = {
        emit: jest.fn(),
        on: jest.fn((event: string, h: Handler) => {
            if (!handlers.has(event)) handlers.set(event, new Set())
            handlers.get(event)!.add(h)
        }),
        off: jest.fn((event: string, h: Handler) => {
            handlers.get(event)?.delete(h)
        }),
        serverSends: (event, payload) => {
            act(() => {
                handlers.get(event)?.forEach(h => h(payload))
            })
        },
        listenedEvents: () =>
            [...handlers.entries()].filter(([, hs]) => hs.size > 0).map(([e]) => e).sort(),
        emitted: event => socket.emit.mock.calls.filter(([e]) => e === event).map(c => c[1]),
        reset: () => {
            handlers.clear()
            socket.emit.mockClear()
            socket.on.mockClear()
            socket.off.mockClear()
        },
    }
    return socket
}

/** A minimal fetch Response double. */
export function jsonResponse(body: unknown, ok = true) {
    return { ok, status: ok ? 200 : 404, json: async () => body }
}
