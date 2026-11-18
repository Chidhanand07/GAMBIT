// Binds the page's event callbacks (commands + simple dispatches) to the current render's state.
import type { Dispatch } from 'react';
import * as commands from '../commands';
import type { ConfirmDialog, GameAction } from '../state/gameReducer';
import type { ChessBoardControls } from './useChessBoard';

interface BindOptions extends commands.CommandContext {
    board: ChessBoardControls;
    router: { push: (href: string) => void };
}

const confirmWith = (dispatch: Dispatch<GameAction>, value: ConfirmDialog) => () =>
    dispatch({ type: 'confirmSet', value });

function boardControls({ state, dispatch }: BindOptions, resign: () => void) {
    return {
        soundOn: state.soundOn,
        onToggleSound: () => dispatch({ type: 'soundToggled' }),
        onFlip: () => dispatch({ type: 'flipToggled' }),
        onToggleFocus: () => dispatch({ type: 'focusToggled' }),
        onDraw: confirmWith(dispatch, 'draw'),
        onResign: confirmWith(dispatch, 'resign'),
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
