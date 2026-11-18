import { cn } from '@/lib/design/cn';
import { ActionButton } from './ActionButton';
import { GAME_ICONS } from './gameIcons';

export interface GameActionsProps {
    /** A player (not a spectator): Draw and Resign are shown. */
    isPlayer: boolean;
    /** The game is over: Draw and Resign stay in place but do nothing. */
    over: boolean;
    onFlip: () => void;
    onDraw: () => void;
    onResign: () => void;
}

/** Flip / Draw / Resign in the controls card: a three-column grid (Game.dc.html). */
export function GameActionsGrid({ isPlayer, over, onFlip, onDraw, onResign }: GameActionsProps) {
    return (
        <div className="grid grid-cols-3 gap-2">
            <ActionButton label="Flip" iconPath={GAME_ICONS.flip} onClick={onFlip} />
            {isPlayer && (
                <>
                    <ActionButton label="Draw" iconPath={GAME_ICONS.draw} onClick={onDraw} disabled={over} />
                    <ActionButton
                        label="Resign"
                        iconPath={GAME_ICONS.resign}
                        onClick={onResign}
                        tone="danger"
                        disabled={over}
                    />
                </>
            )}
        </div>
    );
}

/** Focus mode: Draw / Flip / Resign in a padding-free column right of the board (Game.dc.html). */
export function FocusActions({ isPlayer, over, onFlip, onDraw, onResign }: GameActionsProps) {
    return (
        <div className={cn('flex flex-col justify-center gap-[10px] self-center')}>
            {isPlayer && (
                <ActionButton
                    label="Draw"
                    iconPath={GAME_ICONS.draw}
                    onClick={onDraw}
                    layout="column"
                    disabled={over}
                />
            )}
            <ActionButton label="Flip" iconPath={GAME_ICONS.flip} onClick={onFlip} layout="column" />
            {isPlayer && (
                <ActionButton
                    label="Resign"
                    iconPath={GAME_ICONS.resign}
                    onClick={onResign}
                    tone="danger"
                    layout="column"
                    disabled={over}
                />
            )}
        </div>
    );
}
