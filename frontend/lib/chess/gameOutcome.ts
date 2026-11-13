// The result of a finished `games` row from one player's point of view.
//
// Same reading as the game server's `outcomeOfRow` (server/src/domain/result.js):
// an aborted game (status 'aborted', docs/fixes/DECISIONS.md F-031) is its own outcome;
// `result` ('white' | 'black' | 'draw') decides when present; older decisive rows carry only
// `winner_id`; a row with neither is a draw. A game nobody won is never a loss (F12).

export type PlayerOutcome = 'win' | 'loss' | 'draw' | 'aborted';

export interface OutcomeRow {
    status?: string | null;
    result: string | null;
    winner_id: string | null;
    white_id?: string | null;
    black_id?: string | null;
}

const ABORTED = 'aborted';

function colorOutcome(row: OutcomeRow, profileId: string): PlayerOutcome | null {
    if (row.result === 'white') return row.white_id === profileId ? 'win' : 'loss';
    if (row.result === 'black') return row.black_id === profileId ? 'win' : 'loss';
    return null;
}

export function playerOutcome(row: OutcomeRow, profileId: string): PlayerOutcome {
    if (row.status === ABORTED || row.result === ABORTED) return ABORTED;
    if (row.result === 'draw') return 'draw';
    if (row.winner_id) return row.winner_id === profileId ? 'win' : 'loss';
    return colorOutcome(row, profileId) ?? 'draw';
}
