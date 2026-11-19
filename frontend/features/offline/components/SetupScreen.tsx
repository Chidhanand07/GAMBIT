import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { ColorChoice, Difficulty } from '../types';
import { MaverickChoices } from './MaverickChoices';

interface SetupScreenProps {
    difficulty: Difficulty;
    onDifficulty: (d: Difficulty) => void;
    colorChoice: ColorChoice;
    onColorChoice: (c: ColorChoice) => void;
    onStart: () => void;
}

/**
 * /offline without a preset: the lobby's "Play MAVERICK" card on its own page (no mockup of its
 * own; same choices, tokens and button as Main.dc.html).
 */
export function SetupScreen({ difficulty, onDifficulty, colorChoice, onColorChoice, onStart }: SetupScreenProps) {
    return (
        <div className="mx-auto box-border flex max-w-[640px] flex-col gap-6 px-6 pb-16 pt-9 sm:px-8">
            <div className="flex flex-col gap-1">
                <h1 className="m-0 font-display text-[30px] font-bold leading-[1.2] tracking-[-0.02em]">
                    Play MAVERICK
                </h1>
                <p className="m-0 text-ink-muted">Your personal style bot, trained on your own games.</p>
            </div>
            <Card className="flex flex-col gap-[14px]">
                <MaverickChoices
                    difficulty={difficulty}
                    side={colorChoice}
                    onDifficulty={onDifficulty}
                    onSide={onColorChoice}
                />
                <Button size="2xl" className="flex font-bold" onClick={onStart}>
                    Start Game
                </Button>
            </Card>
        </div>
    );
}
