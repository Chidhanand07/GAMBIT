import { useCallback, useState } from 'react';
import type { LobbyTimeControlId } from '@/types/timeControl';
import { playOnlineTimeControl, selectionMinutes } from '../timeControls';

const DEFAULT_SELECTION: LobbyTimeControlId = 'blitz';
const DEFAULT_CUSTOM_MINUTES = 5;
const DEFAULT_CUSTOM_INCREMENT = 0;

/** The lobby's selected time-control card plus the custom sliders' values. */
export function useTimeControlSelection() {
    const [selectedTc, setSelectedTc] = useState<LobbyTimeControlId>(DEFAULT_SELECTION);
    const [customMin, setCustomMin] = useState(DEFAULT_CUSTOM_MINUTES);
    const [customInc, setCustomInc] = useState(DEFAULT_CUSTOM_INCREMENT);

    // Identity changes only with the selection, so effects depending on it re-run exactly as before.
    const getTcMinutes = useCallback(
        () => selectionMinutes(selectedTc, customMin, customInc),
        [selectedTc, customMin, customInc],
    );

    return {
        selectedTc,
        setSelectedTc,
        customMin,
        setCustomMin,
        customInc,
        setCustomInc,
        getTcMinutes,
        playOnlineTimeControl: playOnlineTimeControl(selectedTc, customMin, customInc),
    };
}

export type TimeControlSelection = ReturnType<typeof useTimeControlSelection>;
