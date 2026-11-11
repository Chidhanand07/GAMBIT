import { X } from 'lucide-react';
import type { ChallengeRequestPayload } from '@/types/socket';
import { accentHover } from '../hover';

interface ChallengeToastProps {
    challenge: Pick<ChallengeRequestPayload, 'from_username' | 'time_control' | 'is_rated'>;
    onAccept: () => void;
    onDecline: () => void;
}

/** Challenge notification — top-right toast. */
export function ChallengeToast({ challenge, onAccept, onDecline }: ChallengeToastProps) {
    return (
        <div className="fixed top-[60px] right-4 z-[300] w-72 animate-in slide-in-from-top-2 fade-in duration-200">
            <div
                className="rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.6)] p-4"
                style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border-accent)' }}
            >
                <div className="flex items-start justify-between mb-3">
                    <div>
                        <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                            <span style={{ color: 'var(--accent)' }}>{challenge.from_username}</span> challenges you
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                            {challenge.time_control} min · {challenge.is_rated ? 'Rated' : 'Casual'}
                        </div>
                    </div>
                    <button
                        onClick={onDecline}
                        className="text-text-tertiary hover:text-text-secondary transition-colors -mt-0.5 -mr-0.5 p-1"
                    >
                        <X size={14} />
                    </button>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={onAccept}
                        className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
                        style={{ background: 'var(--accent)', color: '#0F0D0B' }}
                        {...accentHover}
                    >
                        Accept
                    </button>
                    <button
                        onClick={onDecline}
                        className="flex-1 py-2 rounded-lg text-sm transition-colors"
                        style={{
                            background: 'var(--bg-surface)',
                            border: '0.5px solid var(--border)',
                            color: 'var(--text-secondary)',
                        }}
                    >
                        Decline
                    </button>
                </div>
            </div>
        </div>
    );
}
