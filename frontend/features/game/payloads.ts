// Builders for the client → server payloads the game page emits (field order as in the legacy page).
import type { GameWithPlayers } from '@/types/game';

/** Sent when the game row lacks a time control. */
export const DEFAULT_TIME_CONTROL = '10';

type GameRow = GameWithPlayers | null | undefined;

/** time_control + is_rated tail of the rematch payloads. */
export function rematchTerms(gd: GameRow): { time_control: string; is_rated: boolean } {
    return { time_control: gd?.time_control ?? DEFAULT_TIME_CONTROL, is_rated: gd?.is_rated ?? false };
}
