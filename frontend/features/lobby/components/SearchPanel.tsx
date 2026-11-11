import { fmtTime } from '@/lib/chess/clock';

interface SearchPanelProps {
    /** Seconds since the search started (never negative). */
    searchTime: number;
    onCancel: () => void;
}

export function SearchPanel({ searchTime, onCancel }: SearchPanelProps) {
    return (
        <div
            className="rounded-xl p-5 text-center"
            style={{ background: 'var(--bg-surface)', border: '0.5px solid var(--border-accent)' }}
        >
            <div className="flex items-center justify-center gap-3 mb-3">
                <div
                    className="w-5 h-5 border-2 border-t-accent rounded-full animate-spin"
                    style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }}
                />
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    Finding opponent…
                </span>
            </div>
            <div className="text-sm mb-4 tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
                {fmtTime(searchTime)}
            </div>
            <button
                onClick={onCancel}
                className="px-6 py-2 rounded-lg border text-sm transition-colors hover:bg-hover"
                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
                Cancel search
            </button>
        </div>
    );
}
