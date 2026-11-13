'use client';

// Joins the game room and subscribes to the game events once per socket, signed-in viewer and
// game id (F2). The handlers read the seat, sound setting and callbacks of the latest render
// through an effect event, so resolving the seat or toggling sound never re-joins the room.
import { useEffect, useEffectEvent } from 'react';
import type { Socket } from 'socket.io-client';
import type { Profile } from '@/types/profile';
import { createGameSocketHandlers, joinGameRoom, type SocketHandlerContext } from './gameSocketHandlers';

type LiveContext = Omit<SocketHandlerContext, 'socket' | 'gameId'>;

interface Options extends LiveContext {
    socket: Socket | null;
    gameId: string;
    myProfile: Profile | null;
}

/** A handler context whose render-dependent fields are read when a handler runs, not when it is built. */
function liveHandlerContext(socket: Socket, gameId: string, live: () => LiveContext): SocketHandlerContext {
    return {
        socket,
        gameId,
        get myColor() {
            return live().myColor;
        },
        get soundOn() {
            return live().soundOn;
        },
        get router() {
            return live().router;
        },
        get dispatch() {
            return live().dispatch;
        },
        get chessRef() {
            return live().chessRef;
        },
        get clockSyncedRef() {
            return live().clockSyncedRef;
        },
        get lastProcessedFenRef() {
            return live().lastProcessedFenRef;
        },
        markDisconnected: (timeoutSeconds) => live().markDisconnected(timeoutSeconds),
        markReconnected: () => live().markReconnected(),
    };
}

export function useGameSocket(options: Options): void {
    const { socket, gameId } = options;
    const signedIn = options.myProfile !== null;
    const readLive = useEffectEvent((): LiveContext => options);

    useEffect(() => {
        if (!socket || !signedIn) return;
        const handlers = createGameSocketHandlers(liveHandlerContext(socket, gameId, readLive));
        for (const [event, handler] of handlers) socket.on(event, handler);
        // A socket that is still connecting joins from its `connect` handler instead; emitting
        // here too would be buffered and sent as a second join once it connects.
        if (socket.connected) joinGameRoom(socket, gameId);
        return () => {
            for (const [event, handler] of handlers) socket.off(event, handler);
        };
    }, [socket, signedIn, gameId]);
}
