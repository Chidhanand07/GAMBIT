import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/design/cn';

export type ActionTone = 'default' | 'danger';
/** `grid`: the controls card's three-up row; `column`: focus mode's column right of the board. */
export type ActionLayout = 'grid' | 'column';

const LAYOUTS: Record<ActionLayout, string> = {
    grid: 'min-h-[68px]',
    column: 'w-[96px] min-h-[76px]',
};

const TONES: Record<ActionTone, string> = {
    default: 'border-line text-ink',
    danger: 'border-danger-line text-danger',
};

interface ActionButtonProps {
    label: string;
    iconPath: string;
    onClick: () => void;
    tone?: ActionTone;
    layout?: ActionLayout;
    disabled?: boolean;
}

/** Icon-over-label square button (Game.dc.html Flip / Draw / Resign). */
export function ActionButton({
    label,
    iconPath,
    onClick,
    tone = 'default',
    layout = 'grid',
    disabled = false,
}: ActionButtonProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={cn(
                'box-border flex flex-col items-center justify-center gap-[6px] rounded-14 border-1 bg-bg-base text-[13px] font-semibold disabled:cursor-default',
                LAYOUTS[layout],
                TONES[tone],
            )}
        >
            <Icon path={iconPath} size={22} />
            {label}
        </button>
    );
}
