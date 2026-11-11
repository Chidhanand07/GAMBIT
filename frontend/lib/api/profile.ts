// Client-side fetch helpers for the profile page. Each helper calls the global
// `fetch` with exactly the URL and options the page used before the split
// (including the un-encoded username in `fetchProfileGamesPage`) and returns the
// raw Response, so callers keep their original `ok` / `json()` handling.
import type { Friend, FriendRelation, PendingFriendRequest } from '@/types/friendship';
import type { Profile } from '@/types/profile';
import type { ProfileGamesPayload, ProfileStats } from '@/types/profilePage';

/** A Response whose `json()` resolves to `T` (type-only; no runtime wrapper). */
export interface TypedResponse<T> extends Response {
    json(): Promise<T>;
}

/** GET /api/friends/status/[username] body. */
export interface FriendStatusPayload {
    status?: FriendRelation;
}

const NO_STORE: RequestInit = { cache: 'no-store' };

/** GET /api/profile/<username> (URI-encoded), no-store. */
export function fetchProfile(username: string): Promise<TypedResponse<Profile>> {
    return fetch(`/api/profile/${encodeURIComponent(username)}`, { ...NO_STORE });
}

/** GET /api/profile/me, no-store. */
export function fetchMyProfile(): Promise<TypedResponse<Profile>> {
    return fetch('/api/profile/me', { ...NO_STORE });
}

/** Overview "Recent Games": first 5 games, URI-encoded username, no-store. */
export function fetchRecentGames(username: string): Promise<TypedResponse<ProfileGamesPayload>> {
    return fetch(`/api/profile/${encodeURIComponent(username)}/games?limit=5&offset=0`, { ...NO_STORE });
}

/**
 * Games tab page. LEGACY: the username is NOT URI-encoded here (pinned by the
 * characterization tests); do not "fix" without a behaviour-change PR.
 */
export function fetchProfileGamesPage(
    username: string,
    limit: number,
    offset: number,
): Promise<TypedResponse<ProfileGamesPayload>> {
    return fetch(`/api/profile/${username}/games?limit=${limit}&offset=${offset}`, { ...NO_STORE });
}

/** GET /api/profile/<username>/stats (URI-encoded), no-store. */
export function fetchProfileStats(username: string): Promise<TypedResponse<ProfileStats>> {
    return fetch(`/api/profile/${encodeURIComponent(username)}/stats`, { ...NO_STORE });
}

/** GET /api/friends/status/<username> (URI-encoded), no options. */
export function fetchFriendStatus(username: string): Promise<TypedResponse<FriendStatusPayload>> {
    return fetch(`/api/friends/status/${encodeURIComponent(username)}`);
}

/** GET /api/friends?userId=<id> (not encoded), no options. */
export function fetchFriendsOf(userId: string): Promise<TypedResponse<Friend[]>> {
    return fetch(`/api/friends?userId=${userId}`);
}

/** GET /api/friends/pending, no options. */
export function fetchPendingFriendRequests(): Promise<TypedResponse<PendingFriendRequest[]>> {
    return fetch('/api/friends/pending');
}

/** POST /api/friends/request with `{ addressee_username }`. */
export function sendFriendRequest(addresseeUsername: string): Promise<Response> {
    return fetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addressee_username: addresseeUsername }),
    });
}

/** PUT /api/friends/<friendshipId>?action=<accept|decline>. */
export function respondToFriendRequest(friendshipId: string, action: 'accept' | 'decline'): Promise<Response> {
    return fetch(`/api/friends/${friendshipId}?action=${action}`, { method: 'PUT' });
}
