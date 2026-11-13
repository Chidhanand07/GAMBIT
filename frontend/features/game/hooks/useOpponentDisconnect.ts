'use client';

// Opponent-disconnect banner state and its 1 s countdown (kept outside the reducer, ADR 0211).
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

    // Keyed on "is a countdown running", not on its value: one interval per countdown, which
    // stops when it reaches 0 and starts again for a new disconnect (even one that follows a
    // countdown that already ran out while the opponent stayed away).
    const counting = opponentDisconnected && disconnectCountdown > 0;
    useEffect(() => {
        if (!counting) return;
        const id = setInterval(() => setDisconnectCountdown((prev) => Math.max(0, prev - 1)), TICK_MS);
        return () => clearInterval(id);
    }, [counting]);

    return { opponentDisconnected, disconnectCountdown, markDisconnected, markReconnected };
}
