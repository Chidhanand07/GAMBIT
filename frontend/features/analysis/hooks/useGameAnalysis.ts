'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import { fetchGameAnalysis } from '@/lib/api/analysis';
import type { GameAnalysis } from '@/types/gameAnalysis';

export type GameAnalysisState =
    | { status: 'none' }
    | { status: 'loading' }
    | { status: 'ready'; game: GameAnalysis }
    | { status: 'error'; error: string };

/**
 * The finished game `/analysis?game=<id>` names, with its stored review (ADR F-134); `none`
 * without a game id. `onLoaded` receives the game once, to put its moves on the board.
 */
export function useGameAnalysis(gameId: string | null, onLoaded: (game: GameAnalysis) => void): GameAnalysisState {
    const [state, setState] = useState<{ gameId: string; value: GameAnalysisState } | null>(null);
    // Read when the answer arrives: a new callback identity must not fetch again.
    const loaded = useEffectEvent((game: GameAnalysis) => onLoaded(game));

    useEffect(() => {
        if (!gameId) return;
        let active = true;
        fetchGameAnalysis(gameId)
            .then((result) => {
                if (!active) return;
                if (result.ok) loaded(result.game);
                setState({
                    gameId,
                    value: result.ok
                        ? { status: 'ready', game: result.game }
                        : { status: 'error', error: result.error },
                });
            })
            .catch(() => {
                if (active) setState({ gameId, value: { status: 'error', error: 'Could not load the game' } });
            });
        return () => {
            active = false;
        };
    }, [gameId]);

    if (!gameId) return { status: 'none' };
    return state?.gameId === gameId ? state.value : { status: 'loading' };
}
