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
    /** Shown only when the opponent allows takeback requests (their setting, ADR F-152). */
    takeback?: TakebackAction | null;
    onFlip: () => void;
    onDraw: () => void;
    onResign: () => void;
}

export interface TakebackAction {
    /** My request stands: the button reads "Requested" and is disabled. */
    requested: boolean;
    /** There is a move of mine to undo and no request stands. */
    enabled: boolean;
    onClick: () => void;
}

const drawLabel = (offered?: boolean) => (offered ? 'Draw offered' : 'Draw');
const drawDisabled = ({ over, drawOffered, canOfferDraw = true }: GameActionsProps) =>
    over || Boolean(drawOffered) || !canOfferDraw;

/**
 * Flip / Draw / Resign in the controls card: a three-column grid (Game.dc.html). When the
 * opponent allows takebacks a fourth button, Takeback, joins the row (the mockup has none).
 */
export function GameActionsGrid(props: GameActionsProps) {
    const { isPlayer, over, onFlip, onDraw, onResign } = props;
    const takeback = isPlayer ? props.takeback : null;
    return (
        <div className={cn('grid gap-2', takeback ? 'grid-cols-4' : 'grid-cols-3')}>
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
            {takeback && (
                <ActionButton
                    label={takeback.requested ? 'Requested' : 'Takeback'}
                    iconPath={GAME_ICONS.takeback}
                    onClick={takeback.onClick}
                    disabled={over || takeback.requested || !takeback.enabled}
                />
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
