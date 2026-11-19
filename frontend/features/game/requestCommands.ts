// Player commands for requests between the players: offer, accept and decline a draw
// (ADR F-151); request, accept and decline a takeback (ADR F-152). The payload names only the game: the server knows who is acting from the
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

/** Asks the opponent to take back this player's last move (ADR F-152). */
export function requestTakeback(ctx: CommandContext): void {
    if (!isPlayerInLiveGame(ctx)) return;
    send(ctx, 'takeback_request', { game_id: ctx.gameId });
}

/** Grants the opponent's request; the server's `takeback_applied` restores the board. */
export function acceptTakeback(ctx: CommandContext): void {
    if (!isPlayerInLiveGame(ctx)) return;
    send(ctx, 'takeback_accept', { game_id: ctx.gameId });
}

/** Declines the opponent's request; the prompt closes at once. */
export function declineTakeback(ctx: CommandContext): void {
    if (!isPlayerInLiveGame(ctx)) return;
    ctx.dispatch({ type: 'takebackCleared' });
    send(ctx, 'takeback_decline', { game_id: ctx.gameId });
}
