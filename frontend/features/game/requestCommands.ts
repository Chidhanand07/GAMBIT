// Player commands for requests between the players: offer, accept and decline a draw
// (ADR F-151). The payload names only the game: the server knows who is acting from the
// handshake, and it decides whether the request stands. Refusals are shown as a toast.
import { send, type CommandContext } from './commands';

const isPlayerInLiveGame = ({ socket, state }: CommandContext) =>
    Boolean(socket) && state.myColor !== 'spectator' && !state.gameOver;

/** Offers a draw; the room learns of it from the server's `draw_offered`. */
export function offerDraw(ctx: CommandContext): void {
    ctx.dispatch({ type: 'confirmSet', value: null });
    if (!isPlayerInLiveGame(ctx)) return;
    send(ctx, 'draw_offer', { game_id: ctx.gameId });
}

/** Accepts the opponent's offer; the server's `game_end` shows the result. */
export function acceptDraw(ctx: CommandContext): void {
    if (!isPlayerInLiveGame(ctx)) return;
    send(ctx, 'draw_accept', { game_id: ctx.gameId });
}

/** Declines the opponent's offer; the prompt closes at once (the server confirms to the room). */
export function declineDraw(ctx: CommandContext): void {
    if (!isPlayerInLiveGame(ctx)) return;
    ctx.dispatch({ type: 'drawOfferCleared' });
    send(ctx, 'draw_decline', { game_id: ctx.gameId });
}
