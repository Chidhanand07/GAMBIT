'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { playGameStartSound } from '@/lib/sounds';
import { resolveColor } from '../game';
import type { ComputerSetup } from '../setupParams';
import type { ColorChoice, Difficulty, Phase } from '../types';
import { useComputerBoard } from './useComputerBoard';

/** If the player is Black, MAVERICK (White) moves first after this delay. */
const OPENING_REPLY_DELAY_MS = 500;

/**
 * Setup choices plus the board; `startGame` resets and (as Black) asks MAVERICK to open.
 * With a `preset` (chosen in the lobby) the game starts once, right after mount.
 */
export function useComputerGame(preset: ComputerSetup | null = null) {
    const [phase, setPhase] = useState<Phase>('setup');
    const [difficulty, setDifficulty] = useState<Difficulty>(preset?.difficulty ?? 'medium');
    const [colorChoice, setColorChoice] = useState<ColorChoice>(preset?.colorChoice ?? 'w');
    const board = useComputerBoard(difficulty);
    const { resetBoard, maverickMove } = board;

    const startGame = useCallback(() => {
        const resolved = resolveColor(colorChoice);
        resetBoard(resolved);
        setPhase('playing');
        playGameStartSound();
        if (resolved === 'b') setTimeout(() => maverickMove(), OPENING_REPLY_DELAY_MS);
    }, [colorChoice, resetBoard, maverickMove]);

    const autoStarted = useRef(false);
    useEffect(() => {
        if (!preset || autoStarted.current) return;
        autoStarted.current = true;
        startGame();
    }, [preset, startGame]);

    const backToSetup = () => setPhase('setup');

    return { phase, difficulty, setDifficulty, colorChoice, setColorChoice, startGame, backToSetup, board };
}
