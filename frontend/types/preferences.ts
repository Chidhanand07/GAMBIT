// The account preferences of design/Settings.dc.html that live on the server (ADR F-140):
// "Notifications", "Privacy" and the sign-in e-mail switch of "Account". The play
// preferences ("Board & pieces", "Gameplay") are UserSettings (features/settings/model.ts).

export type ChallengePolicy = 'everyone' | 'friends' | 'nobody';

export interface NotificationPrefs {
    /** Bell notification when a friend challenges you. */
    challenges: boolean;
    /** Bell notification when someone sends you a friend request. */
    friendRequests: boolean;
    /** Bell notification with the result of each finished game. */
    gameResults: boolean;
    /** Bell notification when it is your move in a daily game. */
    yourTurn: boolean;
    /** Weekly e-mail digest (stored; not sent yet, ADR F-142). */
    emailDigest: boolean;
    /** Desktop notifications while Gambit is in the background. */
    browser: boolean;
}

export interface PrivacyPrefs {
    /** Announce yourself in the shared presence set (the green Online badge). */
    showOnline: boolean;
    /** Who may send you a challenge (enforced by the game server). */
    challengePolicy: ChallengePolicy;
    /** Findable by username (stored; there is no search yet, ADR F-142). */
    appearInSearch: boolean;
    /** Listed on the public leaderboard. */
    showOnLeaderboard: boolean;
    /** Others may watch your live games. */
    allowSpectators: boolean;
}

export interface SecurityPrefs {
    /** E-mail on a sign-in from a new device (stored; not sent yet, ADR F-142). */
    emailOnNewSignIn: boolean;
}

export interface AccountPreferences {
    notifications: NotificationPrefs;
    privacy: PrivacyPrefs;
    security: SecurityPrefs;
}

/** GET/PATCH /api/settings body: `stored` is false while the user has never saved. */
export interface PreferencesPayload extends AccountPreferences {
    stored: boolean;
    /** The play preferences as stored (parsed by the client with parseSettings). */
    play: Record<string, unknown>;
}
