import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';

const COMPUTER_ICON = 'M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 21h8M12 17v4';
const FRIEND_ICON =
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75';
/** Computer / Friend: outline pills, 16px medium (Main.dc.html). */
const MODE_BUTTON = 'px-[22px] text-[16px] font-medium';

interface PlayBarProps {
    summary: string;
    onPlayOnline: () => void;
    onComputer: () => void;
    onFriend: () => void;
}

/** "You're playing …" with the three ways to play. */
export function PlayBar({ summary, onPlayOnline, onComputer, onFriend }: PlayBarProps) {
    return (
        <Card as="div" tone="raised" className="flex flex-wrap items-center gap-x-6 gap-y-5">
            <div className="flex min-w-0 flex-[1_1_200px] flex-col gap-[2px]">
                <span className="text-[13px] font-medium text-ink-muted">You&apos;re playing</span>
                <span className="font-display text-[28px] font-bold leading-[1.15] tracking-[-0.02em]">{summary}</span>
            </div>
            <div className="flex flex-wrap gap-[10px]">
                <Button size="2xl" onClick={onPlayOnline} className="flex">
                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M6 3l14 9-14 9z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
                    </svg>
                    Play Online
                </Button>
                <Button variant="outline" size="2xl" onClick={onComputer} className={MODE_BUTTON}>
                    <Icon path={COMPUTER_ICON} />
                    Computer
                </Button>
                <Button variant="outline" size="2xl" onClick={onFriend} className={MODE_BUTTON}>
                    <Icon path={FRIEND_ICON} />
                    Friend
                </Button>
            </div>
        </Card>
    );
}
