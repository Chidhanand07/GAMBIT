'use client';

// Loads GET /api/games/<id> once per id and resolves the viewer's seat (colour + orientation).
import { useEffect, useEffectEvent, type Dispatch, type MutableRefObject } from 'react';
import type { Chess } from 'chess.js';
import { playGameStartSound } from '@/lib/sounds';
import { parseBaseMinutes } from '@/lib/chess/timeControl';
import type { GameWithPlayers } from '@/types/game';
import type { Profile } from '@/types/profile';
import type { GameAction } from '../state/gameReducer';
import { seatFor } from '../utils/seat';

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const SECONDS_PER_MINUTE = 60;

export interface GameRefs {
    chessRef: MutableRefObject<Chess>;
    gameDataRef: MutableRefObject<GameWithPlayers | null>;
    /** Set once clock_sync/game_state_sync arrived, so the fetch does not overwrite synced clocks. */
    clockSyncedRef: MutableRefObject<boolean>;
}

interface Options {
    gameId: string;
    myProfile: Profile | null;
    gameData: GameWithPlayers | null;
    soundOn: boolean;
    router: { push: (href: string) => void };
    refs: GameRefs;
    dispatch: Dispatch<GameAction>;
}

export function useGameData({ gameId, myProfile, gameData, soundOn, router, refs, dispatch }: Options): void {
    // Applied when the fetch resolves, with that moment's profile, sound setting and router.
    const onLoaded = useEffectEvent((gd: GameWithPlayers | null) => {
        if (!gd) {
            router.push('/lobby');
            return;
        }
        dispatch({ type: 'gameLoaded', game: gd });
        refs.gameDataRef.current = gd;
        if (myProfile) dispatch({ type: 'seatResolved', myColor: seatFor(gd, myProfile.id) });
        const isResume = !!(gd.fen && gd.fen !== STARTING_FEN);
        if (gd.fen) {
            refs.chessRef.current.load(gd.fen);
            dispatch({ type: 'positionSet', fen: gd.fen });
        }
        const mins = parseBaseMinutes(gd.time_control);
        if (!refs.clockSyncedRef.current) dispatch({ type: 'clockPreset', seconds: mins * SECONDS_PER_MINUTE });
        if (soundOn && !isResume) playGameStartSound();
    });

    // One fetch per game id; a response for a game we already left is dropped.
    useEffect(() => {
        let current = true;
        void fetch(`/api/games/${gameId}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((gd: GameWithPlayers | null) => {
                if (current) onLoaded(gd);
            });
        return () => {
            current = false;
        };
    }, [gameId]);

    // Keyed on the profile id, not the profile object, so a refreshed profile does not re-resolve.
    const myId = myProfile?.id;
    useEffect(() => {
        if (!gameData || !myId) return;
        dispatch({ type: 'seatResolved', myColor: seatFor(gameData, myId) });
    }, [myId, gameData, dispatch]);
}
