'use client';

import { useState } from 'react';

interface Options {
    loadPosition: (fen: string) => void;
    loadPgn: (pgn: string) => void;
    /** Called after a successful load (switches back to the analysis tab). */
    onLoaded: () => void;
}

/**
 * Import tab inputs and actions. The text lives here (owned by the page) so it
 * survives switching tabs; invalid input alerts and keeps the text.
 */
export function useImportForm({ loadPosition, loadPgn, onLoaded }: Options) {
    const [customFen, setCustomFen] = useState('');
    const [customPgn, setCustomPgn] = useState('');

    const loadQuickPosition = (fen: string) => {
        try {
            loadPosition(fen);
            onLoaded();
        } catch {
            /* preset FENs are valid */
        }
    };

    const loadCustomFen = () => {
        try {
            loadPosition(customFen.trim());
            setCustomFen('');
            onLoaded();
        } catch {
            alert('Invalid FEN');
        }
    };

    const loadCustomPgn = () => {
        try {
            loadPgn(customPgn.trim());
            setCustomPgn('');
            onLoaded();
        } catch {
            alert('Invalid PGN');
        }
    };

    return { customFen, setCustomFen, customPgn, setCustomPgn, loadQuickPosition, loadCustomFen, loadCustomPgn };
}
