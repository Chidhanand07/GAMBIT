import { Icon } from '@/components/ui/Icon';
import { GAME_ICONS } from './gameIcons';

const PILL =
    'flex min-h-[40px] items-center gap-2 rounded-pill border-1.5 border-line bg-bg-base text-[14px] font-semibold text-ink';

interface BoardToolsProps {
    focus: boolean;
    onToggleFocus: () => void;
    soundOn: boolean;
    onToggleSound: () => void;
}

/**
 * The pills above the board: the sound toggle (kept from the previous page; not in the mockup)
 * and Focus mode / Exit focus (Game.dc.html).
 */
export function BoardTools({ focus, onToggleFocus, soundOn, onToggleSound }: BoardToolsProps) {
    return (
        <>
            <button
                type="button"
                onClick={onToggleSound}
                aria-label="Toggle sound"
                aria-pressed={soundOn}
                title="Toggle sound"
                className={`${PILL} justify-center px-[11px]`}
            >
                <Icon path={soundOn ? GAME_ICONS.soundOn : GAME_ICONS.soundOff} size={18} />
            </button>
            <button type="button" onClick={onToggleFocus} aria-pressed={focus} className={`${PILL} px-[14px]`}>
                <Icon path={focus ? GAME_ICONS.focusExit : GAME_ICONS.focusEnter} size={18} />
                {focus ? 'Exit focus' : 'Focus mode'}
            </button>
        </>
    );
}
