'use client';

// Declares this player's "Allow takeback requests" setting to the game server for this game
// (ADR F-152): settings live in the browser, so the server learns them per game. The server's
// default is "not allowed", so nothing is sent until the setting is on; after that every change
// is sent, and the value is sent again on each (re)connection. The server stores it once and
// broadcasts a change to the room.
import { useEffect, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { emitWithAck } from '@/lib/socket/ack';
import type { SeatColor } from '@/types/game';

interface Options {
    socket: Socket | null;
    gameId: string;
    myColor: SeatColor;
    allow: boolean;
    connected: boolean;
    over: boolean;
}

export function useTakebackPref({ socket, gameId, myColor, allow, connected, over }: Options): void {
    const player = myColor !== 'spectator';
    const declared = useRef<string | null>(null);
    useEffect(() => {
        if (!socket || !player || !connected || over) return;
        // The server already assumes "not allowed" for a game this page never declared.
        if (!allow && declared.current !== gameId) return;
        declared.current = gameId;
        // A refusal (the game just ended) needs no message: the setting simply does not apply.
        emitWithAck(socket, 'takeback_pref', { game_id: gameId, allow }, { onRejected: () => {} });
    }, [socket, gameId, player, allow, connected, over]);
}
