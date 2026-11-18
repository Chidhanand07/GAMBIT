import Link from 'next/link';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/design/cn';
import type { LobbyFriend } from '../types';

const ACTION = 'flex min-h-[44px] items-center rounded-pill border-0 px-[18px] font-semibold no-underline';

/** One friend: avatar with presence dot, status and rating, and Challenge (online only). */
export function FriendRow({ friend }: { friend: LobbyFriend }) {
    const name = friend.display_name || friend.username;
    return (
        <div className="flex items-center gap-[14px] rounded-14 border-1 border-line-subtle bg-bg-base px-3 py-[10px]">
            <Avatar
                name={name}
                src={friend.avatar_url}
                size="md"
                tone="surface"
                status={friend.online ? 'online' : 'offline'}
            />
            <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold">{name}</span>
                <span className="text-[13px] text-ink-muted">
                    {friend.online ? 'Online' : 'Offline'} · {friend.rating}
                </span>
            </span>
            {friend.online ? (
                <Link
                    href={`/challenge/${encodeURIComponent(friend.username)}`}
                    aria-label={`Challenge ${name}`}
                    className={cn(ACTION, 'gb bg-accent text-on-accent hover:text-on-accent')}
                >
                    Challenge
                </Link>
            ) : (
                <span className={cn(ACTION, 'bg-bg-base text-ink-faint')}>Offline</span>
            )}
        </div>
    );
}
