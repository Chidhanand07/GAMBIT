// The status line of the controls card (Game.dc.html `status` / `turnDot`), from server state:
// whose move it is while the game runs, and the server's verdict once it has ended.
import type { PlayerColor, SeatColor } from '@/types/game';
import type { GameOverInfo } from '../state/gameReducer';
import { outcomeFlags, winnerOf } from './outcome';

/** `move`: you can move (green dot); `wait`: the other side is to move (gold); `over` (coral). */
export type StatusTone = 'move' | 'wait' | 'over';

export interface GameStatus {
    text: string;
    tone: StatusTone;
}

export interface StatusInput {
    gameOver: GameOverInfo | null;
    myColor: SeatColor;
    isMyTurn: boolean;
    /** The side to move is in check (live position). */
    inCheck: boolean;
    turn: PlayerColor;
    names: Record<PlayerColor, string>;
}

/** Server reasons that read badly as a sentence on their own. */
const REASON_TEXT: Record<string, string> = { Time: 'Out of time', Abandonment: 'Abandoned', Agreement: 'Draw agreed' };

const other = (c: PlayerColor): PlayerColor => (c === 'white' ? 'black' : 'white');

function resignationText(winner: PlayerColor, { myColor, names }: StatusInput): string {
    const loser = other(winner);
    if (myColor === loser) return `You resigned. ${names[winner]} wins.`;
    if (myColor === winner) return `${names[loser]} resigned. You win!`;
    return `${names[loser]} resigned. ${names[winner]} wins.`;
}

function verdictText(over: GameOverInfo, input: StatusInput): string {
    const flags = outcomeFlags(over.result, input.myColor);
    if (flags.isAborted) return 'Game aborted. Not rated.';
    const winner = winnerOf(over.result);
    if (winner && over.reason === 'Resignation') return resignationText(winner, input);
    const reason = REASON_TEXT[over.reason] ?? over.reason;
    if (!winner) return `${reason}. The game is a draw.`;
    return `${reason}. ${flags.isWin ? 'You win!' : `${input.names[winner]} wins.`}`;
}

export function gameStatus(input: StatusInput): GameStatus {
    if (input.gameOver) return { text: verdictText(input.gameOver, input), tone: 'over' };
    if (input.isMyTurn) return { text: input.inCheck ? 'Your move. You are in check' : 'Your move', tone: 'move' };
    return { text: `${input.names[input.turn]} is thinking...`, tone: 'wait' };
}
