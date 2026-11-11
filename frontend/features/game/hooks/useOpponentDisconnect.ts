'use client';

// Opponent-disconnect banner state and its 1 s countdown. Kept outside the reducer because the
// legacy countdown clears its own interval from inside the state updater (ADR 0211).
import { useCallback, useEffect, useState } from 'react';

const TICK_MS = 1000;

export interface OpponentDisconnect {
    opponentDisconnected: boolean;
    disconnectCountdown: number;
    markDisconnected: (timeoutSeconds: number) => void;
    markReconnected: () => void;
}

export function useOpponentDisconnect(): OpponentDisconnect {
    const [opponentDisconnected, setOpponentDisconnected] = useState(false);
    const [disconnectCountdown, setDisconnectCountdown] = useState(0);

    const markDisconnected = useCallback((timeoutSeconds: number) => {
        setOpponentDisconnected(true);
        setDisconnectCountdown(timeoutSeconds);
    }, []);
    const markReconnected = useCallback(() => {
        setOpponentDisconnected(false);
        setDisconnectCountdown(0);
    }, []);

    useEffect(() => {
        if (!opponentDisconnected || disconnectCountdown <= 0) return;
        const id = setInterval(() => {
            setDisconnectCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(id);
                    return 0;
                }
                return prev - 1;
            });
        }, TICK_MS);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- behaviour preservation: omitting disconnectCountdown keeps one interval per disconnect instead of restarting each tick
    }, [opponentDisconnected]);

    return { opponentDisconnected, disconnectCountdown, markDisconnected, markReconnected };
}
