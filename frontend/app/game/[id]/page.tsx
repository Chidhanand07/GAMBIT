'use client';

import ActionBar from '@/features/game/components/ActionBar';
import Board from '@/features/game/components/Board';
import ChatPanel from '@/features/game/components/ChatPanel';
import EnginePanel from '@/features/game/components/EnginePanel';
import EvalBar from '@/features/game/components/EvalBar';
import GameOverModal from '@/features/game/components/GameOverModal';
import GameSidebar from '@/features/game/components/GameSidebar';
import HistoryControls from '@/features/game/components/HistoryControls';
import MoveList from '@/features/game/components/MoveList';
import PlayerStrip from '@/features/game/components/PlayerStrip';
import RematchPrompt from '@/features/game/components/RematchPrompt';
import SidebarActions from '@/features/game/components/SidebarActions';
import StatusBanners from '@/features/game/components/StatusBanners';
import { useGameController } from '@/features/game/hooks/useGameController';
import { deriveGameView } from '@/features/game/utils/gameView';
import { DEFAULT_TIME_CONTROL } from '@/features/game/payloads';

export default function GamePage({ params }: { params: { id: string } }) {
    const game = useGameController(params.id);
    const { state, board, disconnect, controls } = game;
    const view = deriveGameView(state, game.liveChess, board.isMyTurn());
    const { fenSnapshots, viewIndex, myColor, gameOver, gameData } = state;

    return (
        <>
            <div className="max-w-7xl mx-auto px-2 sm:px-4 py-4 flex flex-col lg:flex-row gap-4 min-h-[calc(100vh-60px)]">
                <EvalBar />

                {/* Board column */}
                <div className="flex-1 max-w-[min(80vh,780px)] mx-auto flex flex-col w-full gap-0 relative">
                    <StatusBanners
                        connected={state.connected}
                        isLive={board.isLive}
                        viewIndex={viewIndex}
                        snapshotCount={fenSnapshots.length}
                        onReturnLive={game.returnLive}
                        showOpponentDisconnected={disconnect.opponentDisconnected && !gameOver}
                        disconnectCountdown={disconnect.disconnectCountdown}
                    />
                    <PlayerStrip {...view.top} isBottom={false} isMe={false} timeControl={gameData?.time_control} />
                    <Board
                        displayChess={board.displayChess}
                        liveChess={game.liveChess}
                        isLive={board.isLive}
                        flipped={state.flipped}
                        selectedSq={state.selectedSq}
                        legalDests={state.legalDests}
                        lastMove={state.lastMove}
                        clickable={view.isMyTurn}
                        onSquareClick={board.handleSquareClick}
                        pendingPromotion={state.pendingPromotion}
                        myColor={myColor}
                        onPromote={(move, piece) => board.commitMove(move.from, move.to, piece)}
                        gameOver={gameOver}
                    />
                    <PlayerStrip {...view.bottom} isBottom={true} isMe={true} timeControl={gameData?.time_control} />
                    <ActionBar {...controls} isSpectator={myColor === 'spectator'} />

                    {gameOver && state.showGameOverModal && (
                        <GameOverModal
                            gameOver={gameOver}
                            myColor={myColor}
                            ratingChange={view.myRatingChange}
                            rematchState={state.rematchState}
                            onClose={game.closeModal}
                            onReview={game.reviewGame}
                            onNewGame={game.newGame}
                            onRematch={game.requestRematch}
                        />
                    )}
                </div>

                <GameSidebar
                    activeTab={state.activeTab}
                    onTabSelect={game.selectTab}
                    moves={
                        <>
                            <MoveList
                                moveList={state.moveList}
                                viewIndex={viewIndex}
                                onSelect={board.goToMove}
                                scrollRef={game.moveListRef}
                            />
                            <HistoryControls
                                viewIndex={viewIndex}
                                snapshotCount={fenSnapshots.length}
                                isLive={board.isLive}
                                goToMove={board.goToMove}
                            />
                            <SidebarActions {...controls} />
                        </>
                    }
                    engine={<EnginePanel />}
                    chat={
                        <ChatPanel
                            chatLog={state.chatLog}
                            canChat={myColor !== 'spectator'}
                            draft={state.chatMsg}
                            onDraftChange={game.setChatDraft}
                            onSend={game.sendChat}
                        />
                    }
                    turnIndicator={view.turnIndicator}
                />
            </div>

            {/* Rematch incoming — bottom-right toast */}
            {state.rematchState === 'received' && (
                <RematchPrompt
                    fromUser={state.rematchFromUser}
                    timeControl={gameData?.time_control ?? DEFAULT_TIME_CONTROL}
                    isRated={!!gameData?.is_rated}
                    onDecline={game.declineRematch}
                    onAccept={game.acceptRematch}
                />
            )}
        </>
    );
}
