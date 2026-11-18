import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { computerSetupHref } from '@/features/offline/setupParams';
import type { ColorChoice, Difficulty } from '@/features/offline/types';
import { cn } from '@/lib/design/cn';
import { DIFFICULTY_CHOICES, SIDE_CHOICES } from '../lobbyOptions';
import { StagePanelHeader } from './StagePanelHeader';

const choiceBox = (on: boolean) => (on ? 'border-accent bg-surface-raised' : 'border-line bg-bg-base');

interface ComputerSetupProps {
    difficulty: Difficulty;
    side: ColorChoice;
    onDifficulty: (d: Difficulty) => void;
    onSide: (s: ColorChoice) => void;
    onClose: () => void;
}

/** "Play MAVERICK": difficulty, side, then Start game opens the /offline board with both. */
export function ComputerSetup({ difficulty, side, onDifficulty, onSide, onClose }: ComputerSetupProps) {
    return (
        <Card className="flex flex-col gap-[14px]">
            <StagePanelHeader
                title="Play MAVERICK"
                subtitle="Your personal style bot, trained on your own games."
                onClose={onClose}
            />
            <span className="text-[13px] font-medium text-ink-muted">Difficulty</span>
            {DIFFICULTY_CHOICES.map((d) => (
                <button
                    key={d.id}
                    type="button"
                    aria-pressed={d.id === difficulty}
                    onClick={() => onDifficulty(d.id)}
                    className={cn(
                        'box-border flex min-h-[64px] items-center gap-[14px] rounded-16 border-1.5 px-[18px] py-[10px] text-left text-ink',
                        choiceBox(d.id === difficulty),
                    )}
                >
                    <Icon
                        path={d.icon}
                        size={22}
                        className={cn('shrink-0', d.id === difficulty ? 'text-accent' : 'text-ink-muted')}
                    />
                    <span className="flex flex-col">
                        <span className="text-[17px] font-semibold">{d.name}</span>
                        <span className="text-[14px] text-ink-muted">{d.note}</span>
                    </span>
                </button>
            ))}
            <span className="text-[13px] font-medium text-ink-muted">Play as</span>
            <div className="flex flex-wrap gap-[10px]">
                {SIDE_CHOICES.map((s) => (
                    <button
                        key={s.id}
                        type="button"
                        aria-pressed={s.id === side}
                        onClick={() => onSide(s.id)}
                        className={cn(
                            'box-border flex min-h-[84px] flex-[1_1_120px] flex-col items-center justify-center gap-1 rounded-16 border-1.5 text-ink',
                            choiceBox(s.id === side),
                        )}
                    >
                        <span aria-hidden="true" className="font-symbols text-[30px] leading-none">
                            {s.glyph}
                        </span>
                        <span className="font-semibold">{s.name}</span>
                    </button>
                ))}
            </div>
            <Button href={computerSetupHref({ difficulty, colorChoice: side })} size="2xl" className="flex">
                Start game
            </Button>
        </Card>
    );
}
