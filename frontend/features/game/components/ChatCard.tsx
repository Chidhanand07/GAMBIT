'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/design/cn';
import type { ChatLine } from '../state/gameReducer';

/** Quick replies, sent as they are (Game.dc.html). */
export const QUICK_REPLIES = ['Good luck', 'Nice move', 'Good game', 'Thanks'] as const;
/** The card shows the latest messages only (Game.dc.html `chat.slice(-5)`). */
const VISIBLE_MESSAGES = 5;
const MAX_MESSAGE_LENGTH = 140;

export interface ChatCardProps {
    lines: readonly ChatLine[];
    /** The viewer, to show their own lines as "You". */
    me: { id: string; username: string } | null;
    opponentName: string;
    /** Players chat; spectators only read. */
    canChat: boolean;
    draft: string;
    onDraftChange: (text: string) => void;
    onSend: () => void;
    onQuickReply: (text: string) => void;
}

const isMine = (line: ChatLine, me: ChatCardProps['me']) =>
    Boolean(me) && (line.fromUserId ? line.fromUserId === me?.id : line.from === me?.username);

function ChatRow({ line, mine }: { line: ChatLine; mine: boolean }) {
    return (
        <div className="text-[14px]">
            {mine ? (
                <span className="font-semibold text-accent">You</span>
            ) : (
                <Link href={`/profile/${line.from}`} className="font-semibold text-ink-muted">
                    {line.from}
                </Link>
            )}{' '}
            {line.text}
        </div>
    );
}

function ChatInput({
    draft,
    onDraftChange,
    onSend,
    onQuickReply,
}: Omit<ChatCardProps, 'lines' | 'me' | 'opponentName' | 'canChat'>) {
    return (
        <>
            <div className="flex gap-2">
                <input
                    type="text"
                    value={draft}
                    onChange={(e) => onDraftChange(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && onSend()}
                    placeholder="Type a message"
                    aria-label="Chat message"
                    maxLength={MAX_MESSAGE_LENGTH}
                    className="box-border min-h-[44px] min-w-0 flex-1 rounded-pill border-1.5 border-line bg-bg-base px-[14px] font-[inherit] text-[14px] text-ink"
                />
                <button
                    type="button"
                    onClick={onSend}
                    className="min-h-[44px] rounded-pill border-0 bg-accent px-[18px] font-semibold text-on-accent"
                >
                    Send
                </button>
            </div>
            <div className="flex flex-wrap gap-2">
                {QUICK_REPLIES.map((text) => (
                    <button
                        key={text}
                        type="button"
                        onClick={() => onQuickReply(text)}
                        className="min-h-[40px] rounded-pill border-1.5 border-line bg-bg-base px-[14px] text-[14px] text-ink"
                    >
                        {text}
                    </button>
                ))}
            </div>
        </>
    );
}

/** The chat card: the latest messages, the input and quick replies (Game.dc.html). */
export function ChatCard({ lines, me, opponentName, canChat, ...input }: ChatCardProps) {
    const recent = lines.slice(-VISIBLE_MESSAGES);
    const empty = canChat ? `Say something to ${opponentName}.` : 'No messages yet.';
    return (
        <Card className="flex flex-col gap-3">
            <span className="font-display text-[17px] font-semibold">Chat</span>
            <div className={cn('flex min-h-[40px] flex-col gap-[6px]')}>
                {recent.length === 0 && <div className="text-[14px] text-ink-faint">{empty}</div>}
                {recent.map((line, i) => (
                    <ChatRow key={lines.length - recent.length + i} line={line} mine={isMine(line, me)} />
                ))}
            </div>
            {canChat && <ChatInput {...input} />}
        </Card>
    );
}
