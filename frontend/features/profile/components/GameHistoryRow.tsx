import Link from 'next/link';
import type { PlayerOutcome } from '@/lib/chess/gameOutcome';
import { classifyTimeControl, displayTimeControl } from '@/lib/chess/timeControl';
import type { Profile, ProfileSummary } from '@/types/profile';
import type { ProfileGameRow } from '@/types/profilePage';
import type { RatingField, SpeedBucket } from '@/types/timeControl';
import { accColor, formatDate, gameOutcome } from '../format';

const TC_ICONS: Record<SpeedBucket, string> = { bullet: '⚡', blitz: '🔥', rapid: '⏱', classical: '📖' };
const DEFAULT_TC_ICON = '⏱';
const DEFAULT_RATING = 1200;

function ColorSwatch({ white }: { white: boolean }) {
    return (
        <span
            className={`inline-block w-2.5 h-2.5 rounded-sm border shrink-0 ${white ? 'bg-white border-gray-400' : 'bg-[#222] border-white/30'}`}
        />
    );
}

/** The player's current rating in the game's category (F12: not always rapid). */
function RatingTag({ player, field }: { player: ProfileSummary | null; field: RatingField }) {
    return (
        <span className="text-text-tertiary text-xs tabular-nums shrink-0">
            ({Math.round(player?.[field] ?? DEFAULT_RATING)})
        </span>
    );
}

interface PlayersProps {
    profileName: string;
    ratingField: RatingField;
    isWhite: boolean;
    me: ProfileSummary | null;
    opponent: ProfileSummary | null;
}

function Players({ profileName, ratingField, isWhite, me, opponent }: PlayersProps) {
    return (
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
                <ColorSwatch white={isWhite} />
                <span className="text-text-primary text-sm font-medium truncate">{profileName}</span>
                <RatingTag player={me} field={ratingField} />
            </div>
            <div className="flex items-center gap-1.5">
                <ColorSwatch white={!isWhite} />
                {opponent?.username ? (
                    <Link
                        href={`/profile/${opponent.username}`}
                        className="text-text-secondary text-sm hover:text-accent transition-colors truncate"
                    >
                        {opponent.display_name || opponent.username}
                    </Link>
                ) : (
                    <span className="text-text-secondary text-sm">Unknown</span>
                )}
                <RatingTag player={opponent} field={ratingField} />
            </div>
        </div>
    );
}

const OUTCOME_STYLES: Record<PlayerOutcome, { letter: string; score: string; bg: string; color: string }> = {
    draw: { letter: 'D', score: '½-½', bg: 'rgba(94,83,76,0.2)', color: 'var(--text-secondary)' },
    win: { letter: 'W', score: '1-0', bg: 'rgba(79,168,90,0.2)', color: 'var(--green)' },
    loss: { letter: 'L', score: '0-1', bg: 'rgba(192,57,43,0.2)', color: 'var(--red)' },
    aborted: { letter: 'A', score: 'Aborted', bg: 'rgba(94,83,76,0.2)', color: 'var(--text-tertiary)' },
};

function ResultBadge({ outcome }: { outcome: PlayerOutcome }) {
    const { letter, score, bg, color } = OUTCOME_STYLES[outcome];
    return (
        <div className="shrink-0 flex items-center gap-1.5 ml-2">
            <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                style={{ background: bg, color }}
            >
                {letter}
            </div>
            <span className="text-xs hidden sm:inline" style={{ color }}>
                {score}
            </span>
        </div>
    );
}

function Accuracy({ mine, theirs }: { mine: number | null; theirs: number | null }) {
    return (
        <div className="shrink-0 hidden md:flex flex-col items-center gap-0.5 w-16 ml-3">
            <span className={`text-xs font-medium tabular-nums ${accColor(mine)}`}>
                {mine != null ? `${mine}%` : '—'}
            </span>
            <span className={`text-xs tabular-nums ${accColor(theirs)}`}>{theirs != null ? `${theirs}%` : '—'}</span>
        </div>
    );
}

interface GameHistoryRowProps {
    game: ProfileGameRow;
    profile: Pick<Profile, 'id' | 'username' | 'display_name'>;
    striped: boolean;
}

/** One Games-tab row: speed icon, both players, W/L/D, accuracies, date and a Review link. */
export function GameHistoryRow({ game, profile, striped }: GameHistoryRowProps) {
    const isWhite = game.white_id === profile.id;
    const tc = classifyTimeControl(game.time_control);
    return (
        <div
            className={`flex items-center gap-0 px-4 py-3 hover:bg-hover transition-colors ${striped ? 'bg-elevated/20' : ''}`}
        >
            <div className="shrink-0 w-10 text-center mr-1">
                <span className="text-lg" title={tc}>
                    {TC_ICONS[tc] ?? DEFAULT_TC_ICON}
                </span>
                <div className="text-[10px] text-text-tertiary">
                    {game.time_control ? displayTimeControl(game.time_control) : '—'}
                </div>
            </div>
            <Players
                profileName={profile.display_name || profile.username}
                ratingField={`rating_${tc}`}
                isWhite={isWhite}
                me={isWhite ? game.white : game.black}
                opponent={isWhite ? game.black : game.white}
            />
            <ResultBadge outcome={gameOutcome(game, profile.id)} />
            <Accuracy
                mine={isWhite ? game.white_accuracy : game.black_accuracy}
                theirs={isWhite ? game.black_accuracy : game.white_accuracy}
            />
            <div className="shrink-0 hidden sm:block text-text-tertiary text-xs w-20 text-right ml-2">
                {formatDate(game.created_at)}
            </div>
            <div className="shrink-0 ml-3">
                <Link
                    href={`/game/${game.id}`}
                    className="px-3 py-1.5 bg-elevated hover:bg-hover border border-border rounded-lg text-xs text-text-secondary hover:text-text-primary transition-colors"
                >
                    Review
                </Link>
            </div>
        </div>
    );
}
