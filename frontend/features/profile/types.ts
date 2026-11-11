// UI state types for the profile page (app/profile/[username]/page.tsx).
import type { FriendRelation } from '@/types/friendship';

export type ProfileTab = 'overview' | 'games' | 'stats' | 'friends';

export const PROFILE_TABS: readonly ProfileTab[] = ['overview', 'games', 'stats', 'friends'];

/** Viewer → profile relationship; 'loading' until the first status effect runs. */
export type FriendStatus = FriendRelation | 'loading';
