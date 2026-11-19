// The MAVERICK game screen's panels, drawn with the live game's pieces (Game.dc.html): player
// bars, the status / actions card, and the engine error notice. No mockup exists for /offline.
import type { Chess } from 'chess.js';
import { PlayerBar } from '@/components/chess/PlayerBar';
import { ActionButton } from '@/features/game/components/ActionButton';
import { ControlsCard } from '@/features/game/components/ControlsCard';
import { GAME_ICONS } from '@/features/game/components/gameIcons';
import { GameNotice } from '@/features/game/components/StatusBanners';
import type { GameStatus } from '@/features/game/utils/gameStatus';
import { capturesText, materialBalance } from '@/features/game/utils/material';
import type { Side } from '../types';

const TAKEBACK_ICON = 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-1';
const NEW_GAME_ICON = 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5';

interface BarsProps {
    game: Chess;
    playerColor: Side;
    difficulty: string;
    /** Which bar is on top. */
    position: 'top' | 'bottom';
    gameOver: boolean;
}

/** MAVERICK's bar (top) or the player's (bottom): captures and lead, gold ring on the side to move. */
export function OfflineBar({ game, playerColor, difficulty, position, gameOver }: BarsProps) {
    const side: Side = position === 'bottom' ? playerColor : playerColor === 'w' ? 'b' : 'w';
    const { capturedBy, advantage } = materialBalance(game.fen());
    const lead = side === 'w' ? advantage : -advantage;
    const isPlayer = position === 'bottom';
    return (
        <PlayerBar
            name={isPlayer ? 'You' : 'MAVERICK'}
            rating={isPlayer ? null : difficulty}
            side={side === 'w' ? 'white' : 'black'}
            active={!gameOver && game.turn() === side}
            captures={capturesText(capturedBy[side], lead)}
        />
    );
}

interface ControlsProps {
    status: GameStatus;
    gameOver: boolean;
    undoDisabled: boolean;
    onUndo: () => void;
    onResign: () => void;
    onNewGame: () => void;
    onRematch: () => void;
}

/** Status line, Takeback / Resign / New game, and Rematch after the result. */
export function OfflineControls({ status, gameOver, undoDisabled, ...on }: ControlsProps) {
    const end = gameOver ? { rematchState: 'idle' as const, onRematch: on.onRematch } : null;
    return (
        <ControlsCard status={status} end={end}>
            <div className="grid grid-cols-3 gap-2">
                <ActionButton label="Takeback" iconPath={TAKEBACK_ICON} onClick={on.onUndo} disabled={undoDisabled} />
                <ActionButton
                    label="Resign"
                    iconPath={GAME_ICONS.resign}
                    onClick={on.onResign}
                    tone="danger"
                    disabled={gameOver}
                />
                <ActionButton label="New game" iconPath={NEW_GAME_ICON} onClick={on.onNewGame} />
            </div>
        </ControlsCard>
    );
}

interface EngineErrorProps {
    error: string;
    canRetry: boolean;
    onRetry: () => void;
}

/** MAVERICK's request failed: the reason, and Retry while the retry policy allows it (F13). */
export function EngineErrorBanner({ error, canRetry, onRetry }: EngineErrorProps) {
    return (
        <GameNotice tone="danger" role="alert">
            <span>{error}</span>
            {canRetry ? (
                <button
                    type="button"
                    onClick={onRetry}
                    className="border-0 bg-transparent p-0 font-semibold text-accent underline"
                >
                    Retry
                </button>
            ) : (
                <span className="text-ink-muted">Start a new game to try again.</span>
            )}
        </GameNotice>
    );
}
