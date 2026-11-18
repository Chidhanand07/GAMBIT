// Win / draw / loss of a server-announced result (game_end `result`) from the viewer's seat.
import type { SeatColor } from '@/types/game';

export interface OutcomeFlags {
    isSpectator: boolean;
    isWin: boolean;
    isDraw: boolean;
    isLoss: boolean;
    /** No game was played (a side never made its first move): nobody won or lost, nothing was rated. */
    isAborted: boolean;
}

/** Win/draw/loss from my seat; a spectator is neither a win nor a loss (a draw can still apply). */
export function outcomeFlags(result: string, myColor: SeatColor): OutcomeFlags {
    const isSpectator = myColor === 'spectator';
    const isWin = !isSpectator && result.toLowerCase().startsWith(myColor);
    const isDraw = result.toLowerCase().includes('draw');
    const isAborted = result.toLowerCase().includes('abort');
    return { isSpectator, isWin, isDraw, isAborted, isLoss: !isSpectator && !isWin && !isDraw && !isAborted };
}

/** The winning colour named by a result ("White wins"), or null for a draw or an abort. */
export function winnerOf(result: string): 'white' | 'black' | null {
    const r = result.toLowerCase();
    if (r.startsWith('white')) return 'white';
    if (r.startsWith('black')) return 'black';
    return null;
}
