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
import { StatusBanners } from './StatusBanners';

export function gameActions({ state, controls }: GameScreen): GameActionsProps {
    return {
        isPlayer: state.myColor !== 'spectator',
        over: state.gameOver !== null,
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
            <GameSeat seat={view.top} />
            <Board
                fen={screen.displayFen}
                orientation={state.flipped ? 'black' : 'white'}
                selectedSquare={state.selectedSq}
                {...preferredBoardProps(prefs, { lastMove: state.lastMove, legalDestinations: state.legalDests })}
                checkSquare={screen.checkSquare}
                onSquareClick={view.isMyTurn ? board.handleSquareClick : undefined}
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
