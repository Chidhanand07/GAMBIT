'use client';

import { useProfile } from '@/components/ProfileProvider';
import { useChallengeBanner } from '../hooks/useChallengeBanner';
import { ChallengeToast } from './ChallengeToast';

/**
 * Incoming challenges (socket) on every page, mounted once in the root layout next to the
 * header. Kept apart from the header so screens without it (the live game) still get them.
 */
export default function ChallengeListener() {
    const { profile } = useProfile();
    const challenge = useChallengeBanner(profile);
    if (!challenge.challengeBanner) return null;
    return (
        <ChallengeToast
            challenge={challenge.challengeBanner}
            onAccept={challenge.accept}
            onDecline={challenge.decline}
        />
    );
}
