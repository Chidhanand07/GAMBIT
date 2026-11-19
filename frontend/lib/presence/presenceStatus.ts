// Presence as the friend lists show it: Online, Away or Offline (Profile.dc.html, Main.dc.html).
// Every signed-in tab tracks itself into the shared Supabase presence channel with a `status`
// (PresenceProvider); a tab reports `away` after AWAY_AFTER_MS without input (useIdleStatus).

/** What one tab reports in its presence payload. */
export type TabStatus = 'online' | 'away';
/** What a friend list shows for a user. */
export type PresenceStatus = TabStatus | 'offline';

/** A tab with no pointer, key, wheel or touch input for this long reports itself away. */
export const AWAY_AFTER_MS = 5 * 60_000;

/** One tracked tab's payload, as `channel.presenceState()` lists it. */
export interface PresenceMeta {
    status?: unknown;
}

export interface PresenceSets {
    /** Every user with at least one tab in the channel (away users included). */
    present: ReadonlySet<string>;
    /** Users whose every tab reports away. */
    away: ReadonlySet<string>;
}

/**
 * Who is present and who is away, from the channel's state (key = profile id, one meta per
 * tab). A user is away only when every tab says so: one active tab makes them online. A tab
 * that sends no status (an older client) counts as online.
 */
export function presenceSets(state: Record<string, readonly PresenceMeta[]>): PresenceSets {
    const present = new Set<string>();
    const away = new Set<string>();
    for (const [id, metas] of Object.entries(state)) {
        present.add(id);
        if (metas.length > 0 && metas.every((m) => m.status === 'away')) away.add(id);
    }
    return { present, away };
}

/** A user's status from the two sets; an unknown or missing id is offline. */
export function presenceStatusOf(id: string | null | undefined, sets: PresenceSets): PresenceStatus {
    if (!id || !sets.present.has(id)) return 'offline';
    return sets.away.has(id) ? 'away' : 'online';
}

/** The label a friend list shows. */
export const PRESENCE_LABELS: Readonly<Record<PresenceStatus, string>> = {
    online: 'Online',
    away: 'Away',
    offline: 'Offline',
};
