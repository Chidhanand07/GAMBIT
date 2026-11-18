import { Card } from '@/components/ui/Card';
import { InfoRow } from '@/components/ui/InfoRow';
import type { GameInfoView } from '../utils/gameView';

interface GameInfoCardProps {
    info: GameInfoView;
    timeControl: string;
}

/** "Game info": move number, captures, material, time control and my clock (Game.dc.html). */
export function GameInfoCard({ info, timeControl }: GameInfoCardProps) {
    return (
        <Card className="flex flex-col gap-1">
            <span className="pb-2 font-display text-[17px] font-semibold">Game info</span>
            <InfoRow label="Move" value={info.move} />
            <InfoRow label="Captures" value={info.captures} />
            <InfoRow label="Material" value={info.material} />
            <InfoRow label="Time control" value={timeControl} />
            {info.myClock !== null && <InfoRow label="Your clock" value={info.myClock} />}
        </Card>
    );
}
