// Everything the live game screen shows that is derived from the game state: the two player
// bars, the status line, the title, the "Game info" rows. Pure (the live chess position, the
// displayed FEN and presence are passed in), so it is unit-tested without rendering.
import type { Chess } from 'chess.js';
import { formatClock } from '@/lib/chess/clock';
import { classifyTimeControl, displayTimeControl, SPEED_BUCKET_LABELS } from '@/lib/chess/timeControl';
import type { PlayerColor } from '@/types/game';
import type { GameState } from '../state/gameReducer';
import { gameStatus, type GameStatus } from './gameStatus';
import { captureCount, materialBalance } from './material';
import { playerName, seatOrder, seatView, type SeatContext, type SeatView } from './seatView';

export interface GameHeaderView {
    title: string;
    subtitle: string;
    /** "Blitz 5 min" */
    timeControl: string;
    /** "Rated" / "Unrated", the time control, "N watching" once known, and "Spectating" for a spectator. */
    pills: string[];
}

export interface GameInfoView {
    move: string;
    captures: string;
    material: string;
    /** Null for a spectator. */
    myClock: string | null;
}

export interface GameView {
    top: SeatView;
    bottom: SeatView;
    isMyTurn: boolean;
    status: GameStatus;
    header: GameHeaderView;
    info: GameInfoView;
    /** The other player's name (a spectator gets the side to move). */
    opponentName: string;
}

export interface GameViewInput {
    state: GameState;
    liveChess: Pick<Chess, 'turn' | 'inCheck'>;
    /** The position on the board: live, or the move being reviewed. */
    displayFen: string;
    isMyTurn: boolean;
    onlineUserIds: ReadonlySet<string>;
    opponentDisconnected: boolean;
}

const otherSide = (c: PlayerColor): PlayerColor => (c === 'white' ? 'black' : 'white');

function headerView(state: GameState, names: Record<PlayerColor, string>): GameHeaderView {
    const tc = state.gameData?.time_control;
    const speed = SPEED_BUCKET_LABELS[classifyTimeControl(tc)];
    const length = displayTimeControl(tc);
    const { myColor } = state;
    const seat = myColor === 'spectator' ? 'spectating' : `you play ${myColor === 'white' ? 'White' : 'Black'}`;
    return {
        title: myColor === 'spectator' ? `${names.white} vs ${names.black}` : `Game vs ${names[otherSide(myColor)]}`,
        subtitle: `${speed} · ${length} · ${seat}`,
        timeControl: `${speed} ${length}`,
        pills: [
            state.gameData?.is_rated ? 'Rated' : 'Unrated',
            `${speed} ${length}`,
            ...(state.spectators === null ? [] : [`${state.spectators} watching`]),
            ...(myColor === 'spectator' ? ['Spectating'] : []),
        ],
    };
}

/** "Even", "You +3" / "Bob +3" for a player, "Alice +3" for a spectator. */
function materialText(advantage: number, state: GameState, names: Record<PlayerColor, string>): string {
    if (advantage === 0) return 'Even';
    const leader: PlayerColor = advantage > 0 ? 'white' : 'black';
    const who = leader === state.myColor ? 'You' : names[leader];
    return `${who} +${Math.abs(advantage)}`;
}

function infoView(state: GameState, advantage: number, names: Record<PlayerColor, string>): GameInfoView {
    const { myColor, moveList } = state;
    return {
        move: String(Math.floor(moveList.length / 2) + 1),
        captures: String(captureCount(moveList)),
        material: materialText(advantage, state, names),
        myClock: myColor === 'spectator' ? null : formatClock(myColor === 'white' ? state.whiteTime : state.blackTime),
    };
}

export function deriveGameView(input: GameViewInput): GameView {
    const { state, liveChess } = input;
    const turn: PlayerColor = liveChess.turn() === 'w' ? 'white' : 'black';
    const balance = materialBalance(input.displayFen);
    const names = {
        white: playerName(state.gameData?.white, 'white'),
        black: playerName(state.gameData?.black, 'black'),
    };
    const ctx: SeatContext = { ...input, turn, balance };
    const [top, bottom] = seatOrder(state.flipped).map((side) => seatView(side, ctx));
    const { myColor, gameOver } = state;
    return {
        top,
        bottom,
        isMyTurn: input.isMyTurn,
        status: gameStatus({ gameOver, myColor, isMyTurn: input.isMyTurn, inCheck: liveChess.inCheck(), turn, names }),
        header: headerView(state, names),
        info: infoView(state, balance.advantage, names),
        opponentName: names[myColor === 'spectator' ? turn : otherSide(myColor)],
    };
}
