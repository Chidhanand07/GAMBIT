import { MonitorOff } from 'lucide-react';

export function OfflineBar({ onOpen }: { onOpen: () => void }) {
    return (
        <div
            className="rounded-xl px-4 py-3 mb-5 flex items-center justify-between cursor-pointer transition-colors hover:bg-hover"
            style={{ border: '1px dashed var(--border-strong)' }}
            onClick={onOpen}
        >
            <div className="flex items-center gap-3">
                <MonitorOff size={16} className="text-text-secondary" strokeWidth={1.5} />
                <div>
                    <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        Play Offline
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        No account needed
                    </div>
                </div>
            </div>
            <span className="text-sm text-accent">Open board →</span>
        </div>
    );
}
