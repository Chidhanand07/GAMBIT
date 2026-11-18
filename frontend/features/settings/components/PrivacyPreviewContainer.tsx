import type { PrivacyPrefs } from '@/types/preferences';
import { useLeaderboardRank } from '../hooks/useLeaderboardRank';
import type { SettingsProfile } from '../types';
import { PrivacyPreview } from './PrivacyPreview';

const DEFAULT_RATING = 1200;

/** The privacy preview with the signed-in player's real name, rating and leaderboard place. */
export function PrivacyPreviewContainer({ profile, prefs }: { profile: SettingsProfile; prefs: PrivacyPrefs }) {
    const rank = useLeaderboardRank(profile.username);
    return (
        <PrivacyPreview
            prefs={prefs}
            name={profile.display_name?.trim() || profile.username}
            avatarUrl={profile.avatar_url}
            rating={Math.round(profile.rating_rapid ?? DEFAULT_RATING)}
            rank={rank}
        />
    );
}
