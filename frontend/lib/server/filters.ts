import 'server-only';
import { z } from 'zod';

// PostgREST `.or()` filters are plain strings: `a.eq.<value>,b.eq.<value>`. A value that
// contains `,`, `(` or `)` changes the filter itself, so these builders are the only place
// such strings are assembled, and they refuse anything that is not a UUID (NX-07, NODE-08).

// z.guid() keeps zod 3's uuid() rule (any 8-4-4-4-12 hex id); see schemas.uuid (F-094).
const uuid = z.guid();

/** `id` if it is a UUID; throws otherwise (never interpolate an unchecked value). */
function requireUuid(id: unknown): string {
    const parsed = uuid.safeParse(id);
    if (!parsed.success) throw new RangeError('filter value is not a UUID');
    return parsed.data;
}

/** Games in which `userId` plays either colour. */
export function participantFilter(userId: string): string {
    const id = requireUuid(userId);
    return `white_id.eq.${id},black_id.eq.${id}`;
}

/** Friendships in which `userId` is the requester or the addressee. */
export function eitherSideFilter(userId: string): string {
    const id = requireUuid(userId);
    return `requester_id.eq.${id},addressee_id.eq.${id}`;
}

/** The friendship between two users, in either direction. */
export function betweenUsersFilter(firstId: string, secondId: string): string {
    const a = requireUuid(firstId);
    const b = requireUuid(secondId);
    return `and(requester_id.eq.${a},addressee_id.eq.${b}),and(requester_id.eq.${b},addressee_id.eq.${a})`;
}
