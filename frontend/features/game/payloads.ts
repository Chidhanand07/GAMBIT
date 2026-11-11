// Builders for the client → server payloads the game page emits (field order as in the legacy page).
import type { GameWithPlayers } from '@/types/game';
import type { GameEndPayload } from '@/types/socket';
import type { GameOverInfo } from './state/gameReducer';

/** Sent when the game row lacks a time control. */
export const DEFAULT_TIME_CONTROL = '10';

type GameRow = GameWithPlayers | null | undefined;

/** game_end as emitted by the client after a local checkmate/stalemate or a resignation. */
export function gameEndPayload(gameId: string, outcome: GameOverInfo, gd: GameRow): GameEndPayload {
    return {
        game_id: gameId,
        result: outcome.result,
        reason: outcome.reason,
        white_id: gd?.white_id,
        black_id: gd?.black_id,
        is_rated: gd?.is_rated ?? false,
        time_control: gd?.time_control ?? DEFAULT_TIME_CONTROL,
    };
}

/** time_control + is_rated tail of the rematch payloads. */
export function rematchTerms(gd: GameRow): { time_control: string; is_rated: boolean } {
    return { time_control: gd?.time_control ?? DEFAULT_TIME_CONTROL, is_rated: gd?.is_rated ?? false };
}
