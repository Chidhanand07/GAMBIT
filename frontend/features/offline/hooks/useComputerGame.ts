'use client';

import { useCallback, useState } from 'react';
import { playGameStartSound } from '@/lib/sounds';
import { resolveColor } from '../game';
import type { ColorChoice, Difficulty, Phase } from '../types';
import { useComputerBoard } from './useComputerBoard';

/** If the player is Black, MAVERICK (White) moves first after this delay. */
const OPENING_REPLY_DELAY_MS = 500;

/** Setup choices plus the board; `startGame` resets and (as Black) asks MAVERICK to open. */
export function useComputerGame() {
    const [phase, setPhase] = useState<Phase>('setup');
    const [difficulty, setDifficulty] = useState<Difficulty>('medium');
    const [colorChoice, setColorChoice] = useState<ColorChoice>('w');
    const board = useComputerBoard(difficulty);
    const { resetBoard, maverickMove } = board;

    const startGame = useCallback(() => {
        const resolved = resolveColor(colorChoice);
        resetBoard(resolved);
        setPhase('playing');
        playGameStartSound();
        if (resolved === 'b') setTimeout(() => maverickMove(), OPENING_REPLY_DELAY_MS);
    }, [colorChoice, resetBoard, maverickMove]);

    const backToSetup = () => setPhase('setup');

    return { phase, difficulty, setDifficulty, colorChoice, setColorChoice, startGame, backToSetup, board };
}
