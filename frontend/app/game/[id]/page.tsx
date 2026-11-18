'use client';

import { use } from 'react';
import { BoardTools } from '@/features/game/components/BoardTools';
import { ConfirmDialogs } from '@/features/game/components/ConfirmDialogs';
import { FocusActions } from '@/features/game/components/GameActions';
import { GameLayout } from '@/features/game/components/GameLayout';
import { BoardArea, gameActions, SidePanels } from '@/features/game/components/GameScreenSections';
import RematchPrompt from '@/features/game/components/RematchPrompt';
import { useGameScreen } from '@/features/game/hooks/useGameScreen';
import { DEFAULT_TIME_CONTROL } from '@/features/game/payloads';

export default function GamePage(props: { params: Promise<{ id: string }> }) {
    const params = use(props.params);
    const screen = useGameScreen(params.id);
    const { state, controls, view } = screen;
    const { gameData } = state;

    return (
        <>
            <GameLayout
                focus={screen.focus}
                title={view.header.title}
                subtitle={view.header.subtitle}
                pills={view.header.pills}
                boardTools={
                    <BoardTools
                        focus={screen.focus}
                        onToggleFocus={controls.onToggleFocus}
                        soundOn={controls.soundOn}
                        onToggleSound={controls.onToggleSound}
                    />
                }
                board={<BoardArea screen={screen} />}
                focusActions={<FocusActions {...gameActions(screen)} />}
                aside={<SidePanels screen={screen} />}
            />
            <ConfirmDialogs
                open={state.confirm}
                opponentName={view.opponentName}
                rated={Boolean(gameData?.is_rated)}
                onConfirmResign={controls.onConfirmResign}
                onConfirmDraw={controls.onConfirmDraw}
                onCancel={controls.onCancelConfirm}
            />
            {state.rematchState === 'received' && (
                <RematchPrompt
                    fromUser={state.rematchFromUser}
                    timeControl={gameData?.time_control ?? DEFAULT_TIME_CONTROL}
                    isRated={!!gameData?.is_rated}
                    onDecline={screen.declineRematch}
                    onAccept={screen.acceptRematch}
                />
            )}
        </>
    );
}
