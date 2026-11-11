'use client';

// Chat tab: message log plus (for players) quick replies and the input.
import Link from 'next/link';
import { Send } from 'lucide-react';
import type { ChatLine } from '../state/gameReducer';

const QUICK_REPLIES = ['Good luck!', 'GG', 'Thanks!', '?!'];

export interface ChatPanelProps {
    chatLog: ChatLine[];
    canChat: boolean;
    draft: string;
    onDraftChange: (text: string) => void;
    onSend: () => void;
}

function ChatInput({ draft, onDraftChange, onSend }: Omit<ChatPanelProps, 'chatLog' | 'canChat'>) {
    return (
        <div className="p-3 border-t border-border shrink-0">
            <div className="flex gap-1.5 mb-2 flex-wrap">
                {QUICK_REPLIES.map((t) => (
                    <button
                        key={t}
                        onClick={() => onDraftChange(t)}
                        className="px-2 py-0.5 bg-elevated border border-border rounded text-xs text-text-secondary hover:text-text-primary hover:bg-hover transition-colors"
                    >
                        {t}
                    </button>
                ))}
            </div>
            <div className="flex gap-2 w-full">
                <input
                    value={draft}
                    onChange={(e) => onDraftChange(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && onSend()}
                    placeholder="Send message..."
                    className="flex-1 bg-elevated border border-border-strong rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent min-w-0"
                />
                <button
                    onClick={onSend}
                    className="shrink-0 p-2 bg-accent hover:bg-accent-hover text-surface rounded-lg transition-colors"
                >
                    <Send size={15} strokeWidth={1.5} />
                </button>
            </div>
        </div>
    );
}

export default function ChatPanel({ chatLog, canChat, ...input }: ChatPanelProps) {
    return (
        <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {chatLog.map((msg, i) => (
                    <div
                        key={i}
                        className={`text-sm ${msg.from === 'System' ? 'text-center text-text-tertiary text-xs py-1' : ''}`}
                    >
                        {msg.from !== 'System' && (
                            <Link
                                href={`/profile/${msg.from}`}
                                className="text-text-tertiary text-xs hover:text-accent transition-colors"
                            >
                                {msg.from}:{' '}
                            </Link>
                        )}
                        <span className="text-text-primary">{msg.text}</span>
                    </div>
                ))}
            </div>
            {canChat && <ChatInput {...input} />}
        </div>
    );
}
