// Binds the page's event callbacks (commands + simple dispatches) to the current render's state.
import type { Dispatch } from 'react';
import * as commands from '../commands';
import type { ConfirmDialog, GameAction } from '../state/gameReducer';
import type { ChessBoardControls } from './useChessBoard';

interface BindOptions extends commands.CommandContext {
    board: ChessBoardControls;
    router: { push: (href: string) => void };
    /** Ask before Resign and Draw (the "Confirm resign and draw" setting). Default on. */
    confirmResignDraw?: boolean;
}

const confirmWith = (dispatch: Dispatch<GameAction>, value: ConfirmDialog) => () =>
    dispatch({ type: 'confirmSet', value });

/** Draw has no server flow yet, so without the confirmation step it does nothing. */
function drawWithoutConfirm() {
    // TODO(draw-offer): emit draw_offer once the server flow is approved — see design/DRAW-OFFER-PROPOSAL.md
}

function boardControls({ dispatch, confirmResignDraw = true }: BindOptions, resign: () => void) {
    return {
        onFlip: () => dispatch({ type: 'flipToggled' }),
        onToggleFocus: () => dispatch({ type: 'focusToggled' }),
        onDraw: confirmResignDraw ? confirmWith(dispatch, 'draw') : drawWithoutConfirm,
        onResign: confirmResignDraw ? confirmWith(dispatch, 'resign') : resign,
        onCancelConfirm: confirmWith(dispatch, null),
        onConfirmResign: resign,
        onConfirmDraw: () => {
            // TODO(draw-offer): emit draw_offer once the server flow is approved — see design/DRAW-OFFER-PROPOSAL.md
            dispatch({ type: 'confirmSet', value: null });
        },
    };
}

export function bindGameCommands(opts: BindOptions) {
    const { dispatch, board, router } = opts;
    const resign = () => commands.resign(opts);
    return {
        controls: boardControls(opts, resign),
        sendChat: () => commands.sendChat(opts),
        sendQuickReply: (text: string) => commands.sendChatText(opts, text),
        requestRematch: () => commands.requestRematch(opts),
        acceptRematch: () => commands.acceptRematch(opts),
        declineRematch: () => commands.declineRematch(opts),
        newGame: () => router.push('/lobby'),
        returnLive: () => board.goToMove(null),
        setChatDraft: (text: string) => dispatch({ type: 'chatDraftChanged', text }),
    };
}

export type GameCommands = ReturnType<typeof bindGameCommands>;
