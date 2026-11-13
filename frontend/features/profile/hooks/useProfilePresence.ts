import { usePresence } from '@/components/PresenceProvider';

/**
 * Whether `profileId` is in the shared presence set that every signed-in tab
 * tracks itself into (PresenceProvider, topic `gambit-online-users`, keyed by
 * profile id). A separate, uniquely named channel would never contain anyone,
 * so this reads the provider's set instead of opening its own channel (F11).
 * Signed-out viewers have no presence subscription, so they never see the badge.
 */
export function useProfilePresence(profileId: string | undefined): boolean {
    const { onlineUserIds } = usePresence();
    return profileId !== undefined && onlineUserIds.has(profileId);
}
