// Lobby time-control options and the pure helpers that turn a selection into
// the values sent to the realtime server / private-game API.
import type { LobbyTimeControlId, TimeControl } from '@/types/timeControl';
import type { PrivateColor } from '@/types/lobby';
import type { TcMinutes } from './types';

export interface LobbyTimeControl {
    id: LobbyTimeControlId;
    label: string;
    time: string;
    mins: number;
    inc: number;
}

/** Minutes used when a selection has no matching option (never happens with the six ids). */
const FALLBACK_MINUTES = 10;

export const BASE_TIME_CONTROLS: LobbyTimeControl[] = [
    { id: 'bullet', label: 'Bullet', time: '1 min', mins: 1, inc: 0 },
    { id: 'blitz', label: 'Blitz', time: '3 min', mins: 3, inc: 0 },
    { id: 'rapid', label: 'Rapid', time: '10 min', mins: 10, inc: 0 },
    { id: 'classical', label: 'Classical', time: '30 min', mins: 30, inc: 0 },
    { id: 'custom', label: 'Custom', time: 'Configure', mins: 5, inc: 0 },
    { id: 'daily', label: 'Daily', time: '1 day/move', mins: 1440, inc: 0 },
];

export const TIME_CONTROL_META: Record<string, { subtitle: string; badge?: string }> = {
    bullet: { subtitle: 'Fastest games · Pure instinct' },
    blitz: { subtitle: 'Standard competitive play', badge: 'Popular' },
    rapid: { subtitle: 'Longer games · Deep strategy' },
    classical: { subtitle: 'Maximum depth & preparation' },
    custom: { subtitle: 'Set your own time control' },
    daily: { subtitle: 'Days per move · Correspondence' },
};

/** Options of the private-game modal; sent as-is (e.g. "rapid") except "custom". */
export const PRIVATE_TIME_CONTROL_IDS: LobbyTimeControlId[] = [
    'bullet',
    'blitz',
    'rapid',
    'classical',
    'custom',
    'daily',
];

export const PRIVATE_COLOR_OPTIONS: [PrivateColor, string][] = [
    ['white', 'White'],
    ['black', 'Black'],
    ['random', 'Random'],
];

/** "<min>+<inc>" label/value of the custom control. */
export function customTimeControl(customMin: number, customInc: number): TimeControl {
    return `${customMin}+${customInc}`;
}

/** Minutes/increment of the selection (custom uses the sliders; presets have inc 0). */
export function selectionMinutes(selectedTc: string, customMin: number, customInc: number): TcMinutes {
    if (selectedTc === 'custom') return { mins: customMin, inc: customInc };
    const tc = BASE_TIME_CONTROLS.find((t) => t.id === selectedTc);
    return { mins: tc?.mins ?? FALLBACK_MINUTES, inc: tc?.inc ?? 0 };
}

/**
 * `time_control` sent by the Play Online button: "<min>+<inc>" for custom,
 * otherwise the preset's minutes as a string. (The reconnect re-queue sends
 * only the minutes — see useMatchmaking.)
 */
export function playOnlineTimeControl(selectedTc: string, customMin: number, customInc: number): TimeControl {
    if (selectedTc === 'custom') return customTimeControl(customMin, customInc);
    const tc = BASE_TIME_CONTROLS.find((t) => t.id === selectedTc);
    return String(tc?.mins ?? FALLBACK_MINUTES);
}

/** `timeControl` POSTed for a private game: the option id, or "<min>+<inc>" for custom. */
export function privateTimeControl(privateTc: string, customMin: number, customInc: number): TimeControl {
    return privateTc === 'custom' ? customTimeControl(customMin, customInc) : privateTc;
}
