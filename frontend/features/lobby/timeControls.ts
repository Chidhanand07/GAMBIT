// Lobby time-control options and the pure helpers that turn a selection into
// the values sent to the realtime server / private-game API.
import { TIME_CONTROL_PRESETS, formatTimeControl, timeControlOf } from '@/lib/chess/timeControl';
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

/** Minutes shown on the custom card before the sliders are touched. */
const CUSTOM_CARD_MINUTES = 5;

/** A preset card: its minutes and increment come from the shared definition. */
function preset(id: LobbyTimeControlId, label: string, time: string): LobbyTimeControl {
    const { minutes, incrementSeconds } = timeControlOf(TIME_CONTROL_PRESETS[id]);
    return { id, label, time, mins: minutes, inc: incrementSeconds };
}

export const BASE_TIME_CONTROLS: LobbyTimeControl[] = [
    preset('bullet', 'Bullet', '1 min'),
    preset('blitz', 'Blitz', '3 min'),
    preset('rapid', 'Rapid', '10 min'),
    preset('classical', 'Classical', '30 min'),
    { id: 'custom', label: 'Custom', time: 'Configure', mins: CUSTOM_CARD_MINUTES, inc: 0 },
    preset('daily', 'Daily', '1 day/move'),
];

export const TIME_CONTROL_META: Record<string, { subtitle: string; badge?: string }> = {
    bullet: { subtitle: 'Fastest games · Pure instinct' },
    blitz: { subtitle: 'Standard competitive play', badge: 'Popular' },
    rapid: { subtitle: 'Longer games · Deep strategy' },
    classical: { subtitle: 'Maximum depth & preparation' },
    custom: { subtitle: 'Set your own time control' },
    daily: { subtitle: 'Days per move · Correspondence' },
};

/** Options of the private-game modal. */
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
    return formatTimeControl({ minutes: customMin, incrementSeconds: customInc });
}

/** The selection as a model: the sliders for custom, the shared preset otherwise (unknown → default). */
function selectionModel(selectedTc: string, customMin: number, customInc: number) {
    if (selectedTc === 'custom') return { minutes: customMin, incrementSeconds: customInc };
    return timeControlOf(TIME_CONTROL_PRESETS[selectedTc]);
}

/** Minutes/increment of the selection (custom uses the sliders). */
export function selectionMinutes(selectedTc: string, customMin: number, customInc: number): TcMinutes {
    const { minutes, incrementSeconds } = selectionModel(selectedTc, customMin, customInc);
    return { mins: minutes, inc: incrementSeconds };
}

/** `time_control` sent to the matchmaking queue: always the canonical "<min>+<inc>". */
export function playOnlineTimeControl(selectedTc: string, customMin: number, customInc: number): TimeControl {
    return formatTimeControl(selectionModel(selectedTc, customMin, customInc));
}

/**
 * `timeControl` POSTed for a private game: the real time control of the chosen option
 * (F9: the option id used to be sent, and the server played every such game as 10 minutes).
 */
export function privateTimeControl(privateTc: string, customMin: number, customInc: number): TimeControl {
    return formatTimeControl(selectionModel(privateTc, customMin, customInc));
}
