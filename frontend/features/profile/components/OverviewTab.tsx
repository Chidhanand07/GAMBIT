import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/design/cn';
import {
    PRESENCE_LABELS,
    presenceStatusOf,
    type PresenceSets,
    type PresenceStatus,
} from '@/lib/presence/presenceStatus';
import type { PlayerOutcome } from '@/lib/chess/gameOutcome';
import { displayTimeControl } from '@/lib/chess/timeControl';
import type { Friend } from '@/types/friendship';
import type { ProfileGameRow } from '@/types/profilePage';
import { formatDate, gameOutcome } from '../format';
import { profileHref } from '../links';
import type { Badge, Fact } from '../model';
import { EMPTY, LINK_BUTTON, LIST_CARD, LIST_ROW, LIST_TITLE, PANEL, PANEL_TITLE } from './styles';

const FRIENDS_SHOWN = 4;

function AboutCard({ facts }: { facts: Fact[] }) {
    return (
        <Card className={cn(PANEL, 'flex-[1.4_1_340px]')}>
            <span className={PANEL_TITLE}>About</span>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-[14px]">
                {facts.map((f) => (
                    <div key={f.k} className="flex min-w-0 flex-col gap-[2px]">
                        <span className="text-[13px] text-ink-muted">{f.k}</span>
                        {f.href ? (
                            <a
                                href={f.href}
                                target="_blank"
                                rel="nofollow noopener noreferrer ugc"
                                className="font-semibold [overflow-wrap:anywhere]"
                            >
                                {f.v}
                            </a>
                        ) : (
                            <span className="font-semibold">{f.v}</span>
                        )}
                    </div>
                ))}
            </div>
        </Card>
    );
}

interface FriendsCardProps {
    friends: Friend[];
    presence: PresenceSets;
    onSeeAll: () => void;
}

/** Dot colour per status (Profile.dc.html: green, amber, grey). */
const STATUS_DOT: Readonly<Record<PresenceStatus, string>> = {
    online: 'bg-success',
    away: 'bg-accent',
    offline: 'bg-ink-disabled',
};

function FriendLine({ friend, status }: { friend: Friend; status: PresenceStatus }) {
    const name = friend.display_name || friend.username;
    return (
        <div className="flex items-center gap-3">
            <span
                aria-hidden="true"
                className="relative box-content flex h-9 w-9 items-center justify-center rounded-full border-1.5 border-line bg-bg-base font-bold text-accent"
            >
                {name.charAt(0).toUpperCase()}
                <span
                    className={cn(
                        'absolute -bottom-px -right-px h-[10px] w-[10px] rounded-full border-2 border-surface',
                        STATUS_DOT[status],
                    )}
                />
            </span>
            <Link href={profileHref(friend.username)} className="flex-1 font-medium no-underline">
                {name}
            </Link>
            <span className="text-[13px] text-ink-muted">{PRESENCE_LABELS[status]}</span>
        </div>
    );
}

function FriendsCard({ friends, presence, onSeeAll }: FriendsCardProps) {
    return (
        <Card className={cn(PANEL, 'flex-[1_1_260px]')}>
            <div className="flex items-center justify-between">
                <span className={PANEL_TITLE}>Friends</span>
                <button type="button" onClick={onSeeAll} className={LINK_BUTTON}>
                    See all
                </button>
            </div>
            {friends.length === 0 && <span className="text-ink-muted">No friends yet.</span>}
            {friends.slice(0, FRIENDS_SHOWN).map((f) => (
                <FriendLine key={f.friendship_id ?? f.username} friend={f} status={presenceStatusOf(f.id, presence)} />
            ))}
        </Card>
    );
}

function AchievementsCard({ badges }: { badges: Badge[] }) {
    return (
        <Card className={PANEL}>
            <span className={PANEL_TITLE}>Achievements</span>
            <div className="flex flex-wrap gap-[10px]">
                {badges.map((b) => (
                    <div
                        key={b.name}
                        className="flex flex-[1_1_150px] items-center gap-3 rounded-14 border-1 border-line bg-bg-base px-[14px] py-3"
                    >
                        <span
                            aria-hidden="true"
                            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-accent font-symbols text-[22px] leading-none text-on-accent"
                        >
                            {b.glyph}
                        </span>
                        <span className="flex flex-col">
                            <span className="text-[14px] font-semibold">{b.name}</span>
                            <span className="text-[12px] text-ink-muted">{b.note}</span>
                        </span>
                    </div>
                ))}
            </div>
        </Card>
    );
}

export const OUTCOME_TEXT: Record<PlayerOutcome, { label: string; className: string }> = {
    win: { label: 'Win', className: 'text-success' },
    loss: { label: 'Loss', className: 'text-danger' },
    draw: { label: 'Draw', className: 'text-ink-muted' },
    aborted: { label: 'Aborted', className: 'text-ink-disabled' },
};

function RecentGameRow({ game, profileId }: { game: ProfileGameRow; profileId: string }) {
    const opp = game.white_id === profileId ? game.black : game.white;
    const { label, className } = OUTCOME_TEXT[gameOutcome(game, profileId)];
    return (
        <div className={LIST_ROW}>
            <span className={cn('w-[52px] text-[14px] font-bold', className)}>{label}</span>
            <span className="flex-[1_1_160px] font-medium">
                {opp?.username ? (
                    <Link href={profileHref(opp.username)} className="no-underline">
                        vs {opp.display_name || opp.username}
                    </Link>
                ) : (
                    'vs Unknown'
                )}
                <span className="ml-[6px] text-[14px] text-ink-muted">{displayTimeControl(game.time_control)}</span>
            </span>
            <span className="text-[14px] text-ink-muted">{formatDate(game.created_at)}</span>
        </div>
    );
}

interface RecentGamesCardProps {
    games: ProfileGameRow[];
    loading: boolean;
    profileId: string;
    onViewAll: () => void;
}

function RecentGamesCard({ games, loading, profileId, onViewAll }: RecentGamesCardProps) {
    return (
        <Card className={LIST_CARD}>
            <div className="flex items-center justify-between border-b-1 border-line px-6 py-4">
                <h2 className={LIST_TITLE}>Recent games</h2>
                <button type="button" onClick={onViewAll} className={LINK_BUTTON}>
                    View all
                </button>
            </div>
            {loading && <div className={EMPTY}>Loading games…</div>}
            {!loading && games.length === 0 && <div className={EMPTY}>No completed games yet.</div>}
            {games.map((g) => (
                <RecentGameRow key={g.id} game={g} profileId={profileId} />
            ))}
        </Card>
    );
}

export interface OverviewTabProps {
    profileId: string;
    facts: Fact[];
    badges: Badge[];
    friends: Friend[];
    presence: PresenceSets;
    recentGames: ProfileGameRow[];
    recentLoading: boolean;
    onSeeFriends: () => void;
    onViewAllGames: () => void;
}

/** About + Friends, Achievements (when any are earned) and the five most recent games. */
export function OverviewTab(props: OverviewTabProps) {
    return (
        <>
            <div className="flex flex-wrap gap-3">
                <AboutCard facts={props.facts} />
                <FriendsCard friends={props.friends} presence={props.presence} onSeeAll={props.onSeeFriends} />
            </div>
            {props.badges.length > 0 && <AchievementsCard badges={props.badges} />}
            <RecentGamesCard
                games={props.recentGames}
                loading={props.recentLoading}
                profileId={props.profileId}
                onViewAll={props.onViewAllGames}
            />
        </>
    );
}
