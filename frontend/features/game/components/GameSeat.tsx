import { Clock } from '@/components/chess/Clock';
import { PlayerBar } from '@/components/chess/PlayerBar';
import type { SeatView } from '../utils/seatView';

/** One player bar with its clock and draining time bar (Game.dc.html). */
export function GameSeat({ seat }: { seat: SeatView }) {
    const side = seat.side === 'white' ? 'White' : 'Black';
    return (
        <PlayerBar
            name={seat.name}
            nameHref={seat.href}
            badge={seat.isMe ? 'You' : null}
            rating={seat.rating}
            side={seat.side}
            avatarUrl={seat.avatarUrl}
            online={seat.online}
            active={seat.active}
            captures={seat.captures}
            timePercent={seat.timePercent}
            low={seat.low}
            clock={
                <Clock
                    seconds={seat.seconds}
                    active={seat.active}
                    low={seat.low}
                    label={seat.isMe ? 'Your clock' : `${side} clock`}
                />
            }
        />
    );
}
