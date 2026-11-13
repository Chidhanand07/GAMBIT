'use client';

// Joins the game room and subscribes to the 13 game events; unsubscribes the same handlers on cleanup.
import { useEffect } from 'react';
import type { Socket } from 'socket.io-client';
import type { Profile } from '@/types/profile';
import { createGameSocketHandlers, joinGameRoom, type SocketHandlerContext } from './gameSocketHandlers';

interface Options extends Omit<SocketHandlerContext, 'socket'> {
    socket: Socket | null;
    myProfile: Profile | null;
}

export function useGameSocket({ socket, myProfile, gameId, myColor, soundOn, ...rest }: Options): void {
    useEffect(() => {
        if (!socket || !myProfile) return;
        joinGameRoom(socket, gameId);
        const handlers = createGameSocketHandlers({
            ...rest,
            socket,
            gameId,
            myColor,
            soundOn,
        });
        for (const [event, handler] of handlers) socket.on(event, handler);
        return () => {
            for (const [event, handler] of handlers) socket.off(event, handler);
        };
        // LEGACY: myColor and soundOn are deps, so resolving the seat or toggling sound re-emits
        // join_game and re-registers every handler (pinned by characterization tests).
        // eslint-disable-next-line react-hooks/exhaustive-deps -- behaviour preservation: exact legacy deps; router/dispatch/refs are read from the effect's own render (ADR 0212)
    }, [socket, myProfile, gameId, myColor, soundOn]);
}
