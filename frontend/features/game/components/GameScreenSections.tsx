'use client';

// Composition of the live game screen's sections from the screen hook (useGameScreen): each
// section hands plain props to the presentational components.
import { Board } from '@/components/chess/Board';
import { MoveList } from '@/components/chess/MoveList';
import { preferredBoardProps } from '@/features/settings/boardProps';
import { useBoardPrefs } from '@/features/settings/SettingsProvider';
import type { GameScreen } from '../hooks/useGameScreen';
import { ChatCard } from './ChatCard';
import { ControlsCard } from './ControlsCard';
import { GameActionsGrid, type GameActionsProps } from './GameActions';
import { GameInfoCard } from './GameInfoCard';
import { GameSeat } from './GameSeat';
import { PromotionPicker } from './PromotionPicker';
import { canOfferDraw } from '../utils/drawOffer';
import { canRequestTakeback } from '../utils/takeback';
import { RequestPrompt } from './RequestPrompt';
import { StatusBanners } from './StatusBanners';

/** Draw button state for a player: their own offer stands, or the server would take one now. */
function drawState({ myColor, drawOffer, lastDrawOfferPly, moveList }: GameScreen['state']) {
    if (myColor === 'spectator') return { drawOffered: false, canOfferDraw: false };
    const pending = drawOffer !== null;
    const plies = moveList.length;
    return {
        drawOffered: drawOffer === myColor,
        canOfferDraw: canOfferDraw({ color: myColor, plies, pending, lastOfferPly: lastDrawOfferPly[myColor] }),
    };
}

/** The Takeback button, when the opponent allows takeback requests (their setting). */
function takebackAction(screen: GameScreen): GameActionsProps['takeback'] {
    const { state, liveChess } = screen;
    const me = state.myColor;
    if (me === 'spectator' || state.takebackPrefs[me === 'white' ? 'black' : 'white'] !== true) return null;
    const myTurn = liveChess.turn() === me[0];
    const pending = state.takeback !== null;
    return {
        requested: state.takeback?.by === me,
        enabled: canRequestTakeback({ plies: state.moveList.length, myTurn, pending }),
        onClick: screen.requestTakeback,
    };
}

export function gameActions(screen: GameScreen): GameActionsProps {
    const { state, controls } = screen;
    return {
        isPlayer: state.myColor !== 'spectator',
        over: state.gameOver !== null,
        ...drawState(state),
        takeback: takebackAction(screen),
        onFlip: controls.onFlip,
        onDraw: controls.onDraw,
        onResign: controls.onResign,
    };
}

export function BoardArea({ screen }: { screen: GameScreen }) {
    const { state, board, disconnect, view } = screen;
    const pending = state.pendingPromotion;
    const prefs = useBoardPrefs();
    return (
        <>
            <StatusBanners
                connected={state.connected}
                isLive={board.isLive}
                viewIndex={state.viewIndex}
                snapshotCount={state.fenSnapshots.length}
                onReturnLive={screen.returnLive}
                showOpponentDisconnected={disconnect.opponentDisconnected && !state.gameOver}
                disconnectCountdown={disconnect.disconnectCountdown}
            />
            <IncomingRequests screen={screen} />
            <GameSeat seat={view.top} />
            <Board
                fen={screen.displayFen}
                orientation={state.flipped ? 'black' : 'white'}
                selectedSquare={state.selectedSq}
                {...preferredBoardProps(prefs, { lastMove: state.lastMove, legalDestinations: state.legalDests })}
                checkSquare={screen.checkSquare}
                premove={board.isLive ? state.premove : null}
                onSquareClick={view.isMyTurn || board.premoveActive ? board.handleSquareClick : undefined}
            >
                {pending && state.myColor !== 'spectator' && (
                    <PromotionPicker
                        color={state.myColor === 'white' ? 'w' : 'b'}
                        onSelect={(piece) => board.commitMove(pending.from, pending.to, piece)}
                    />
                )}
            </Board>
            <GameSeat seat={view.bottom} />
        </>
    );
}

const takebackText = (name: string, plies: number) =>
    plies === 1 ? `${name} asks to take back their last move` : `${name} asks to take back the last two moves`;

/** The opponent's standing draw offer and takeback request, waiting for this player's answer. */
function IncomingRequests({ screen }: { screen: GameScreen }) {
    const { state, view } = screen;
    const me = state.myColor;
    if (me === 'spectator' || state.gameOver) return null;
    const { drawOffer, takeback } = state;
    return (
        <>
            {drawOffer && drawOffer !== me && (
                <RequestPrompt
                    text={`${view.opponentName} offers a draw`}
                    onAccept={screen.acceptDraw}
                    onDecline={screen.declineDraw}
                />
            )}
            {takeback && takeback.by !== me && (
                <RequestPrompt
                    text={takebackText(view.opponentName, takeback.plies)}
                    onAccept={screen.acceptTakeback}
                    onDecline={screen.declineTakeback}
                />
            )}
        </>
    );
}

export function SidePanels({ screen }: { screen: GameScreen }) {
    const { state, view, board } = screen;
    const isPlayer = state.myColor !== 'spectator';
    const end = {
        rematchState: isPlayer ? state.rematchState : null,
        onRematch: screen.requestRematch,
        onNewGame: screen.newGame,
    };
    return (
        <>
            <ControlsCard status={view.status} end={state.gameOver ? end : null}>
                <GameActionsGrid {...gameActions(screen)} />
            </ControlsCard>
            <GameInfoCard info={view.info} timeControl={view.header.timeControl} />
            <ChatCard
                lines={state.chatLog}
                me={screen.me}
                opponentName={view.opponentName}
                canChat={isPlayer}
                draft={state.chatMsg}
                onDraftChange={screen.setChatDraft}
                onSend={screen.sendChat}
                onQuickReply={screen.sendQuickReply}
            />
            <MoveList
                moves={state.moveList}
                currentPly={state.viewIndex}
                onSelectPly={board.goToMove}
                scrollRef={screen.moveListRef}
                className="flex-1"
            />
        </>
    );
}
