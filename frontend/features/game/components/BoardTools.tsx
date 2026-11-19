import { Icon } from '@/components/ui/Icon';
import { GAME_ICONS } from './gameIcons';

const PILL =
    'flex min-h-[40px] items-center gap-2 rounded-pill border-1.5 border-line bg-bg-base px-[14px] text-[14px] font-semibold text-ink';

interface BoardToolsProps {
    focus: boolean;
    onToggleFocus: () => void;
}

/**
 * The pill above the board: Focus mode / Exit focus (Game.dc.html). Move sounds are switched in
 * Settings, not here: the mockup has no slot for a sound control (F-102).
 */
export function BoardTools({ focus, onToggleFocus }: BoardToolsProps) {
    return (
        <button type="button" onClick={onToggleFocus} aria-pressed={focus} className={PILL}>
            <Icon path={focus ? GAME_ICONS.focusExit : GAME_ICONS.focusEnter} size={18} />
            {focus ? 'Exit focus' : 'Focus mode'}
        </button>
    );
}
