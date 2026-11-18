import Link from 'next/link';
import { Board } from '@/components/chess/Board';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { OFFLINE_PATH } from '@/features/offline/setupParams';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Starting-position board and the link to the MAVERICK board. */
export function OfflineBoardCard() {
    return (
        <Card as="div" className="flex flex-col gap-4">
            <Board fen={START_FEN} frame="compact" label="Chess board in the starting position" />
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col">
                    <span className="font-display text-[18px] font-semibold">Play Offline</span>
                    <span className="text-[14px] text-ink-muted">No account needed</span>
                </div>
                <Link
                    href={OFFLINE_PATH}
                    className="box-content flex min-h-[44px] items-center gap-2 rounded-pill border-1.5 border-ink px-[18px] font-semibold text-ink no-underline"
                >
                    Open board
                    <Icon name="arrowRight" size={16} strokeWidth={2} />
                </Link>
            </div>
        </Card>
    );
}
