import { cn } from '@/lib/design/cn';
import type { PrivateGame } from '../hooks/usePrivateGame';
import { PRIVATE_COLOR_OPTIONS, PRIVATE_TIME_CONTROL_IDS } from '../timeControls';

const option = (on: boolean) =>
    cn(
        'box-border min-h-[44px] rounded-12 border-1.5 text-[14px] font-semibold capitalize',
        on ? 'border-accent bg-surface-raised text-ink' : 'border-line bg-bg-base text-ink-muted',
    );

function OptionLabel({ children }: { children: string }) {
    return <span className="self-start text-[13px] font-medium text-ink-muted">{children}</span>;
}

function RatedSwitch({ rated, onToggle }: { rated: boolean; onToggle: () => void }) {
    return (
        <div className="flex items-center justify-between gap-3 text-left">
            <span className="flex flex-col">
                <span className="font-semibold">Rated game</span>
                <span className="text-[13px] text-ink-muted">Affects Glicko-2 rating</span>
            </span>
            <button
                type="button"
                role="switch"
                aria-checked={rated}
                aria-label="Rated game"
                onClick={onToggle}
                className={cn(
                    'relative h-7 w-12 shrink-0 rounded-pill border-1 border-line',
                    rated ? 'bg-accent' : 'bg-bg-base',
                )}
            >
                <span
                    className={cn(
                        'absolute top-[3px] h-5 w-5 rounded-full bg-ink motion-safe:transition-[left] motion-safe:duration-200',
                        rated ? 'left-[24px]' : 'left-[3px]',
                    )}
                />
            </button>
        </div>
    );
}

/** Time control, colour and rated choices of an invite link. */
export function PrivateGameOptions({ game }: { game: PrivateGame }) {
    return (
        <div className="flex flex-col gap-3">
            <OptionLabel>Time control</OptionLabel>
            <div className="grid grid-cols-3 gap-2">
                {PRIVATE_TIME_CONTROL_IDS.map((tc) => (
                    <button
                        key={tc}
                        type="button"
                        aria-pressed={game.privateTc === tc}
                        onClick={() => game.setPrivateTc(tc)}
                        className={option(game.privateTc === tc)}
                    >
                        {tc}
                    </button>
                ))}
            </div>
            <OptionLabel>Your colour</OptionLabel>
            <div className="grid grid-cols-3 gap-2">
                {PRIVATE_COLOR_OPTIONS.map(([value, label]) => (
                    <button
                        key={value}
                        type="button"
                        aria-pressed={game.privateColor === value}
                        onClick={() => game.setPrivateColor(value)}
                        className={option(game.privateColor === value)}
                    >
                        {label}
                    </button>
                ))}
            </div>
            <RatedSwitch rated={game.privateRated} onToggle={game.toggleRated} />
        </div>
    );
}
