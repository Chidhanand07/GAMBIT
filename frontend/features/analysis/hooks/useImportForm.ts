'use client';

import { useState } from 'react';
import type { QuickPosition } from '../quickPositions';

interface Options {
    loadPosition: (fen: string) => void;
    loadPgn: (pgn: string) => void;
}

export const IMPORT_MESSAGES = {
    fenEmpty: 'Paste a FEN first.',
    fenInvalid: "That FEN doesn't look valid.",
    fenLoaded: 'Position loaded.',
    pgnEmpty: 'Paste a PGN first.',
    pgnInvalid: "That PGN doesn't look valid.",
    pgnLoaded: 'Game received. Moves will appear in the Analysis tab.',
} as const;

/** Runs `load(text)`; the message to show for empty, rejected or accepted input. */
function attempt(text: string, load: (t: string) => void, msgs: [string, string, string]): string {
    const [empty, invalid, loaded] = msgs;
    if (!text) return empty;
    try {
        load(text);
        return loaded;
    } catch {
        return invalid;
    }
}

/**
 * Import tab inputs, actions and their status lines (Analysis.dc.html). The text lives here
 * (owned by the page) so it survives switching tabs; a successful load clears it, a rejected
 * one keeps it so it can be corrected.
 */
export function useImportForm({ loadPosition, loadPgn }: Options) {
    const [customFen, setCustomFen] = useState('');
    const [customPgn, setCustomPgn] = useState('');
    const [fenMessage, setFenMessage] = useState('');
    const [pgnMessage, setPgnMessage] = useState('');
    const m = IMPORT_MESSAGES;

    const loadQuickPosition = (q: QuickPosition) => {
        loadPosition(q.fen);
        setFenMessage(`${q.name} loaded.`);
    };

    const loadCustomFen = () => {
        const msg = attempt(customFen.trim(), loadPosition, [m.fenEmpty, m.fenInvalid, m.fenLoaded]);
        if (msg === m.fenLoaded) setCustomFen('');
        setFenMessage(msg);
    };

    const loadCustomPgn = () => {
        const msg = attempt(customPgn.trim(), loadPgn, [m.pgnEmpty, m.pgnInvalid, m.pgnLoaded]);
        if (msg === m.pgnLoaded) setCustomPgn('');
        setPgnMessage(msg);
    };

    return {
        customFen,
        setCustomFen,
        customPgn,
        setCustomPgn,
        fenMessage,
        pgnMessage,
        loadQuickPosition,
        loadCustomFen,
        loadCustomPgn,
    };
}
