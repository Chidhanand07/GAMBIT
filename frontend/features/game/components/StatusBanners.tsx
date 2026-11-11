'use client';

// Banners above the board: own reconnect, history viewing, opponent disconnect countdown.
export interface StatusBannersProps {
    connected: boolean;
    isLive: boolean;
    viewIndex: number | null;
    snapshotCount: number;
    onReturnLive: () => void;
    showOpponentDisconnected: boolean;
    disconnectCountdown: number;
}

const WARNING_BANNER =
    'w-full text-center text-xs bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 py-1.5 rounded-lg mb-1 flex items-center justify-center gap-2';

export default function StatusBanners(props: StatusBannersProps) {
    const { viewIndex, snapshotCount } = props;
    return (
        <>
            {!props.connected && (
                <div className={WARNING_BANNER}>
                    <div className="w-3 h-3 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                    Reconnecting…
                </div>
            )}

            {!props.isLive && (
                <div className="w-full text-center text-xs bg-accent/10 border border-accent/30 text-accent py-1.5 rounded-lg mb-1">
                    Viewing move {viewIndex! + 1} of {snapshotCount} —{' '}
                    <button onClick={props.onReturnLive} className="underline hover:text-accent-hover">
                        Return to live
                    </button>
                </div>
            )}

            {props.showOpponentDisconnected && (
                <div className={WARNING_BANNER}>
                    <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                    Opponent disconnected — they have {props.disconnectCountdown}s to reconnect
                </div>
            )}
        </>
    );
}
