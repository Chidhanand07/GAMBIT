import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { emitWithAck } from '@/lib/socket/ack';

/** What the server says resigning now would cost (ADR F-133). */
export type ResignEstimate = { rated: false } | { rated: true; points: number };

/** A well-formed `rating_estimate` ack, or null (then the dialog names no figure). */
export function parseEstimate(ack: unknown): ResignEstimate | null {
    const a = ack as { rated?: unknown; points?: unknown } | null | undefined;
    if (a?.rated === false) return { rated: false };
    if (a?.rated === true && typeof a.points === 'number' && Number.isInteger(a.points) && a.points >= 0) {
        return { rated: true, points: a.points };
    }
    return null;
}

interface Options {
    socket: Socket | null;
    gameId: string;
    /** The resign confirmation is open for a player of this game. */
    open: boolean;
}

/**
 * While the resign dialog is open, the rating points a loss would cost right now, computed by
 * the game server with the real Glicko-2 service. Asked each time the dialog opens; null while
 * the first answer is on its way or when the server could not say.
 */
export function useResignEstimate({ socket, gameId, open }: Options): ResignEstimate | null {
    const [estimate, setEstimate] = useState<{ gameId: string; value: ResignEstimate } | null>(null);

    useEffect(() => {
        if (!open || !socket) return;
        let active = true;
        emitWithAck(
            socket,
            'rating_estimate',
            { game_id: gameId },
            {
                onAccepted: (ack) => {
                    const value = parseEstimate(ack);
                    if (active && value) setEstimate({ gameId, value });
                },
                onRejected: () => {},
            },
        );
        return () => {
            active = false;
        };
    }, [open, socket, gameId]);

    return open && estimate?.gameId === gameId ? estimate.value : null;
}
