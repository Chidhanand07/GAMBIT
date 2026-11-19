import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { computerSetupHref } from '@/features/offline/setupParams';
import type { ColorChoice, Difficulty } from '@/features/offline/types';
import { MaverickChoices } from '@/features/offline/components/MaverickChoices';
import { StagePanelHeader } from './StagePanelHeader';

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
            <MaverickChoices difficulty={difficulty} side={side} onDifficulty={onDifficulty} onSide={onSide} />
            <Button href={computerSetupHref({ difficulty, colorChoice: side })} size="2xl" className="flex">
                Start game
            </Button>
        </Card>
    );
}
