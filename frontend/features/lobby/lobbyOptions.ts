// What the lobby cards show (design/Main.dc.html `baseVals()` / `playVals()`): icons, blurbs
// and labels of the time-control tiles (the MAVERICK difficulties and sides: features/offline/choices).
import type { LobbyTimeControlId } from '@/types/timeControl';

export interface TileCopy {
    blurb: string;
    /** Text of the "You're playing" bar. */
    summary: string;
    /** 24×24 icon path. */
    icon: string;
    popular?: boolean;
}

export const TILE_COPY: Record<LobbyTimeControlId, TileCopy> = {
    bullet: {
        blurb: 'Fastest games · Pure instinct',
        summary: 'Bullet · 1 min',
        icon: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z',
    },
    blitz: {
        blurb: 'Standard competitive play',
        summary: 'Blitz · 3 min',
        icon: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z',
        popular: true,
    },
    rapid: {
        blurb: 'Longer games · Deep strategy',
        summary: 'Rapid · 10 min',
        icon: 'M10 2h4M12 14l3-3M20 14a8 8 0 1 1-16 0 8 8 0 0 1 16 0z',
    },
    classical: {
        blurb: 'Maximum depth & preparation',
        summary: 'Classical · 30 min',
        icon: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z',
    },
    custom: {
        blurb: 'Set your own time control',
        summary: 'Custom time control',
        icon: 'M4 7h3M11 7h9M4 17h9M17 17h3M11 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM17 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0z',
    },
    daily: {
        blurb: 'Days per move · Correspondence',
        summary: 'Daily · 1 day/move',
        icon: 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M3 10h18',
    },
};

// The MAVERICK choices live with the computer game; the lobby's setup card shows them too.
export { DIFFICULTY_CHOICES, SIDE_CHOICES, type DifficultyChoice } from '@/features/offline/choices';
