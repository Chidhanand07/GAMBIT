// Pure helpers behind the lobby cards: the "You're playing" text, the time-control name used in
// status lines, and which rating the rating card shows.
import { SPEED_BUCKET_LABELS, classifyTimeControl } from '@/lib/chess/timeControl';
import type { LobbyTimeControlId, RatingField, SpeedBucket, TimeControl } from '@/types/timeControl';
import { DEFAULT_RATING } from './constants';
import { TILE_COPY } from './lobbyOptions';
import { customTimeControl } from './timeControls';

/** "Blitz · 3 min"; the custom control reads "Custom · 12+5". */
export function selectionSummary(id: LobbyTimeControlId, customMin: number, customInc: number): string {
    return id === 'custom' ? `Custom · ${customTimeControl(customMin, customInc)}` : TILE_COPY[id].summary;
}

/** "Blitz", "Custom", "Daily": the selection's name in status lines. */
export function selectionName(id: LobbyTimeControlId): string {
    return id.charAt(0).toUpperCase() + id.slice(1);
}

export interface CategoryRating {
    category: SpeedBucket;
    label: string;
    rating: number;
}

/** The player's rating in the category of the time control they would queue for. */
export function categoryRating(
    timeControl: TimeControl,
    ratings: Partial<Record<RatingField, number | null>>,
): CategoryRating {
    const category = classifyTimeControl(timeControl);
    return {
        category,
        label: `${SPEED_BUCKET_LABELS[category]} rating`,
        rating: Math.round(ratings[`rating_${category}`] ?? DEFAULT_RATING),
    };
}

/** "Blitz 3+0": a live game's category and time control. */
export function liveGameLabel(category: SpeedBucket, timeControl: TimeControl): string {
    return `${SPEED_BUCKET_LABELS[category]} ${timeControl}`;
}
