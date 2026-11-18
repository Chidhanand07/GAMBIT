// The two player bars around the board (Game.dc.html): who sits on top / bottom, their rating,
// captures, clock and whether they are to move. Pure: everything comes in through the arguments.
import { clockPercent, isClockLow } from '@/lib/chess/clock';
import { parseBaseMinutes, ratingFieldFor } from '@/lib/chess/timeControl';
import type { PlayerColor } from '@/types/game';
import type { ProfileSummary } from '@/types/profile';
import type { GameState } from '../state/gameReducer';
import { capturesText, type MaterialBalance } from './material';

const DEFAULT_RATING = 1200;
const SECONDS_PER_MINUTE = 60;

type Player = ProfileSummary | null | undefined;

export interface SeatView {
    side: PlayerColor;
    name: string;
    /** Profile page of the player, when known. */
    href: string | null;
    /** Rating in this time control's category, with the rating change once the server sent it. */
    rating: string;
    avatarUrl: string | null;
    online: boolean;
    /** To move (and the game is still running). */
    active: boolean;
    captures: string;
    seconds: number;
    timePercent: number;
    low: boolean;
    /** The viewer's own bar; never true for a spectator (F4). */
    isMe: boolean;
}

export interface SeatContext {
    state: GameState;
    /** Side to move in the live game. */
    turn: PlayerColor;
    balance: MaterialBalance;
    /** Profile ids currently online (presence). */
    onlineUserIds: ReadonlySet<string>;
    opponentDisconnected: boolean;
}

/** Rating shown on a bar: the player's rating in this time control's category (shared model, F7). */
export function getFormatRating(p: Player, tc?: string): number {
    if (!p) return DEFAULT_RATING;
    return Math.round(p[ratingFieldFor(tc)] ?? DEFAULT_RATING);
}

export const playerName = (p: Player, side: PlayerColor) =>
    p?.display_name || p?.username || (side === 'white' ? 'White' : 'Black');

const signed = (n: number) => `${n >= 0 ? '+' : ''}${n}`;

function ratingText(player: Player, tc: string | undefined, change: number | null): string {
    const rating = getFormatRating(player, tc);
    return change === null ? String(rating) : `${rating} ${signed(change)}`;
}

/** Me: my own connection; the opponent: presence, and not while the server reports them away. */
function isOnline(side: PlayerColor, ctx: SeatContext): boolean {
    const { state } = ctx;
    if (state.myColor === side) return state.connected;
    const id = side === 'white' ? state.gameData?.white_id : state.gameData?.black_id;
    const away = state.myColor !== 'spectator' && ctx.opponentDisconnected;
    return Boolean(id && ctx.onlineUserIds.has(id)) && !away;
}

interface SideData {
    player: Player;
    seconds: number;
    ratingChange: number | null;
    /** Material lead of this side, in pawns. */
    lead: number;
    captured: MaterialBalance['capturedBy']['w'];
}

function sideData(side: PlayerColor, { state, balance }: SeatContext): SideData {
    if (side === 'white') {
        const { whiteTime, whiteRatingChange, gameData } = state;
        return {
            player: gameData?.white,
            seconds: whiteTime,
            ratingChange: whiteRatingChange,
            lead: balance.advantage,
            captured: balance.capturedBy.w,
        };
    }
    const { blackTime, blackRatingChange, gameData } = state;
    return {
        player: gameData?.black,
        seconds: blackTime,
        ratingChange: blackRatingChange,
        lead: -balance.advantage,
        captured: balance.capturedBy.b,
    };
}

export function seatView(side: PlayerColor, ctx: SeatContext): SeatView {
    const { state } = ctx;
    const { player, seconds, ratingChange, lead, captured } = sideData(side, ctx);
    const tc = state.gameData?.time_control;
    const total = parseBaseMinutes(tc) * SECONDS_PER_MINUTE;
    const running = !state.gameOver;
    return {
        side,
        name: playerName(player, side),
        href: player?.username ? `/profile/${player.username}` : null,
        rating: ratingText(player, tc, ratingChange),
        avatarUrl: player?.avatar_url ?? null,
        online: isOnline(side, ctx),
        active: running && ctx.turn === side,
        captures: capturesText(captured, lead),
        seconds,
        timePercent: clockPercent(seconds, total),
        low: running && isClockLow(seconds, total),
        isMe: state.myColor === side,
    };
}

/** [top, bottom]: black on top unless the board is flipped. */
export function seatOrder(flipped: boolean): [PlayerColor, PlayerColor] {
    return flipped ? ['white', 'black'] : ['black', 'white'];
}
