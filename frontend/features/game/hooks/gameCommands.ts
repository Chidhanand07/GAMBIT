// Binds the page's event callbacks (commands + simple dispatches) to the current render's state.
import type { Dispatch } from 'react';
import * as commands from '../commands';
import type { GameAction, SidebarTab } from '../state/gameReducer';
import { stepBackIndex } from '../utils/history';
import type { ChessBoardControls } from './useChessBoard';

interface BindOptions extends commands.CommandContext {
    board: ChessBoardControls;
    router: { push: (href: string) => void };
}

function boardControls({ state, dispatch, board }: BindOptions, resign: () => void) {
    const { fenSnapshots, viewIndex, myColor, gameOver } = state;
    return {
        soundOn: state.soundOn,
        onToggleSound: () => dispatch({ type: 'soundToggled' }),
        onFlip: () => dispatch({ type: 'flipToggled' }),
        hasHistory: fenSnapshots.length > 0,
        onStepBack: () => board.goToMove(stepBackIndex(viewIndex, fenSnapshots.length)),
        canResign: myColor !== 'spectator' && !gameOver,
        resignConfirm: state.resignConfirm,
        onResignRequest: () => dispatch({ type: 'resignConfirmSet', value: true }),
        onResignConfirm: resign,
        onResignCancel: () => dispatch({ type: 'resignConfirmSet', value: false }),
    };
}

const hideModal = (dispatch: Dispatch<GameAction>) => dispatch({ type: 'gameOverModalShown', visible: false });

export function bindGameCommands(opts: BindOptions) {
    const { dispatch, board, router } = opts;
    const resign = () => commands.resign(opts);
    return {
        controls: boardControls(opts, resign),
        sendChat: () => commands.sendChat(opts),
        requestRematch: () => commands.requestRematch(opts),
        acceptRematch: () => commands.acceptRematch(opts),
        declineRematch: () => commands.declineRematch(opts),
        closeModal: () => hideModal(dispatch),
        reviewGame: () => {
            hideModal(dispatch);
            board.goToMove(0);
        },
        newGame: () => {
            hideModal(dispatch);
            router.push('/lobby');
        },
        returnLive: () => board.goToMove(null),
        selectTab: (tab: SidebarTab) => dispatch({ type: 'tabSelected', tab }),
        setChatDraft: (text: string) => dispatch({ type: 'chatDraftChanged', text }),
    };
}

export type GameCommands = ReturnType<typeof bindGameCommands>;
