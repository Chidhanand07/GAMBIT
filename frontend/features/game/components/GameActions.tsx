import { cn } from '@/lib/design/cn';
import { ActionButton } from './ActionButton';
import { GAME_ICONS } from './gameIcons';

export interface GameActionsProps {
    /** A player (not a spectator): Draw and Resign are shown. */
    isPlayer: boolean;
    /** The game is over: Draw and Resign stay in place but do nothing. */
    over: boolean;
    /** This player's draw offer stands: the Draw button reads "Draw offered" and is disabled. */
    drawOffered?: boolean;
    /** The server would accept a draw offer now (utils/drawOffer); otherwise Draw is disabled. */
    canOfferDraw?: boolean;
    onFlip: () => void;
    onDraw: () => void;
    onResign: () => void;
}

const drawLabel = (offered?: boolean) => (offered ? 'Draw offered' : 'Draw');
const drawDisabled = ({ over, drawOffered, canOfferDraw = true }: GameActionsProps) =>
    over || Boolean(drawOffered) || !canOfferDraw;

/** Flip / Draw / Resign in the controls card: a three-column grid (Game.dc.html). */
export function GameActionsGrid(props: GameActionsProps) {
    const { isPlayer, over, onFlip, onDraw, onResign } = props;
    return (
        <div className="grid grid-cols-3 gap-2">
            <ActionButton label="Flip" iconPath={GAME_ICONS.flip} onClick={onFlip} />
            {isPlayer && (
                <>
                    <ActionButton
                        label={drawLabel(props.drawOffered)}
                        iconPath={GAME_ICONS.draw}
                        onClick={onDraw}
                        disabled={drawDisabled(props)}
                    />
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
export function FocusActions(props: GameActionsProps) {
    const { isPlayer, over, onFlip, onDraw, onResign } = props;
    return (
        <div className={cn('flex flex-col justify-center gap-[10px] self-center')}>
            {isPlayer && (
                <ActionButton
                    label={drawLabel(props.drawOffered)}
                    iconPath={GAME_ICONS.draw}
                    onClick={onDraw}
                    layout="column"
                    disabled={drawDisabled(props)}
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
