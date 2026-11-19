// The rows of the "Notifications" and "Privacy" cards and the Account switches
// (design/Settings.dc.html `defs`), as data. Values live in AccountPreferences (ADR F-140).
import type { AccountPreferences } from '@/types/preferences';
import type { PreferenceSection } from './hooks/useAccountPrefsDraft';

interface RowBase {
    section: PreferenceSection;
    key: string;
    label: string;
    hint: string;
}

export type AccountRowDef =
    (RowBase & { kind: 'switch' }) | (RowBase & { kind: 'choice'; options: { id: string; label: string }[] });

const toggle = (section: PreferenceSection, key: string, label: string, hint: string): AccountRowDef => ({
    kind: 'switch',
    section,
    key,
    label,
    hint,
});

export const NOTIFICATION_ROWS: AccountRowDef[] = [
    toggle('notifications', 'challenges', 'Challenges', 'When a friend challenges you to a game.'),
    toggle('notifications', 'friendRequests', 'Friend requests', 'When someone wants to add you.'),
    toggle('notifications', 'gameResults', 'Game results', 'A summary after each finished game.'),
    toggle('notifications', 'yourTurn', 'Your turn (daily games)', 'Reminder when it is your move.'),
    toggle('notifications', 'emailDigest', 'Weekly email digest', 'Your ratings and best game of the week.'),
    toggle('notifications', 'browser', 'Browser notifications', 'Alerts even when Gambit is in the background.'),
];

export const PRIVACY_ROWS: AccountRowDef[] = [
    toggle('privacy', 'showOnline', 'Show when I am online', 'Friends see the green Online badge.'),
    {
        kind: 'choice',
        section: 'privacy',
        key: 'challengePolicy',
        label: 'Who can challenge me',
        hint: 'Limit incoming challenges.',
        options: [
            { id: 'everyone', label: 'Everyone' },
            { id: 'friends', label: 'Friends' },
            { id: 'nobody', label: 'Nobody' },
        ],
    },
    toggle('privacy', 'appearInSearch', 'Appear in search', 'Let players find you by username.'),
    toggle('privacy', 'showOnLeaderboard', 'Show on leaderboard', 'Include you in public rankings.'),
    toggle('privacy', 'allowSpectators', 'Allow spectators', 'Others may watch your live games.'),
];

export const SIGN_IN_EMAIL_ROW = toggle(
    'security',
    'emailOnNewSignIn',
    'Email me on new sign-ins',
    'Get a note when a new device signs in.',
);

/** The current value of a row in `prefs`. */
export function rowValue(prefs: AccountPreferences, row: AccountRowDef): unknown {
    return (prefs[row.section] as unknown as Record<string, unknown>)[row.key];
}
