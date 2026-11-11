import Link from 'next/link';
import type { ActiveGame } from '@/types/lobby';

export function ActiveGameBanner({ activeGame }: { activeGame: ActiveGame }) {
    return (
        <div
            className="mb-4 px-5 py-3 rounded-xl flex items-center justify-between"
            style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-accent)' }}
        >
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                You have an active game in progress
            </span>
            <Link
                href={`/game/${activeGame.id}`}
                className="px-4 py-1.5 rounded-lg text-sm font-medium btn-press"
                style={{ background: 'var(--accent)', color: '#0F0D0B' }}
            >
                Resume →
            </Link>
        </div>
    );
}
