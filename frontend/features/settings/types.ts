import type { useProfile } from '@/components/ProfileProvider';

/** The signed-in profile as exposed by ProfileProvider. */
export type SettingsProfile = NonNullable<ReturnType<typeof useProfile>['profile']>;
