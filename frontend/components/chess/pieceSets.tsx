'use client';

import { createContext, useContext, type ReactNode } from 'react';

// The piece sets of design/Settings.dc.html ("Board & pieces" → "Piece set", ADR F-147). The
// shared Piece component draws the set that the nearest provider names; the app's provider is the
// settings (features/settings/SettingsProvider), a preview can wrap its own board in another.

export type PieceSet = 'gambit' | 'classic' | 'lineart';

export const PIECE_SETS: readonly PieceSet[] = ['gambit', 'classic', 'lineart'];
export const PIECE_SET_LABELS: Record<PieceSet, string> = { gambit: 'Gambit', classic: 'Classic', lineart: 'Line art' };
export const DEFAULT_PIECE_SET: PieceSet = 'gambit';

const PieceSetContext = createContext<PieceSet>(DEFAULT_PIECE_SET);

export function PieceSetProvider({ value, children }: { value: PieceSet; children: ReactNode }) {
    return <PieceSetContext.Provider value={value}>{children}</PieceSetContext.Provider>;
}

/** The piece set in effect here (the default Gambit set without a provider). */
export function usePieceSet(): PieceSet {
    return useContext(PieceSetContext);
}
