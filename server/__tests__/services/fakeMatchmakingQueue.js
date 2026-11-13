/**
 * In-memory MatchmakingQueue for service tests. It must pass the same
 * contract as the Redis repository (__tests__/repositories/
 * matchmakingQueue.contract.test.js, SOLID-04 / TEST-08): sorted-by-joined_at
 * members, entries that expire unless touched, a claim that takes both players
 * or neither, and a compare-and-delete pairing lock.
 */
const DEFAULT_ENTRY_TTL_MS = 120_000;

function fakeMatchmakingQueue({ entryTtlMs = DEFAULT_ENTRY_TTL_MS, clock = () => Date.now() } = {}) {
    /** userId → joined_at (the sorted set). */
    const members = new Map();
    /** userId → { json, expiresAt } */
    const entries = new Map();
    let lock = null;

    const live = (userId) => {
        const e = entries.get(userId);
        if (e && clock() >= e.expiresAt) entries.delete(userId);
        return entries.get(userId) ?? null;
    };
    const drop = (userId) => {
        entries.delete(userId);
        members.delete(userId);
    };
    const ordered = () =>
        [...members.entries()].sort(([ida, a], [idb, b]) => a - b || (ida < idb ? -1 : ida > idb ? 1 : 0)).map(([id]) => id);
    const present = ({ user_id, joined_at }) => live(user_id) !== null && members.get(user_id) === Number(joined_at);

    return {
        async add(entry) {
            const current = live(entry.user_id);
            if (current && JSON.parse(current.json).socketId === entry.socketId) return null;
            entries.set(entry.user_id, { json: JSON.stringify(entry), expiresAt: clock() + entryTtlMs });
            members.set(entry.user_id, entry.joined_at);
            return members.size;
        },
        async get(userId) {
            const e = live(userId);
            return e ? JSON.parse(e.json) : null;
        },
        async remove(userId, socketId = '') {
            const e = live(userId);
            if (!e) {
                members.delete(userId);
                return false;
            }
            if (socketId !== '' && JSON.parse(e.json).socketId !== socketId) return false;
            drop(userId);
            return true;
        },
        async list() {
            const out = [];
            for (const id of ordered()) {
                const e = live(id);
                if (e) out.push(JSON.parse(e.json));
                else members.delete(id);
            }
            return out;
        },
        async size() {
            return members.size;
        },
        async claimPair(a, b) {
            if (a.user_id === b.user_id || !present(a) || !present(b)) return false;
            drop(a.user_id);
            drop(b.user_id);
            return true;
        },
        async touch(userIds) {
            return userIds.filter((id) => {
                const e = live(id);
                if (e) e.expiresAt = clock() + entryTtlMs;
                return Boolean(e);
            });
        },
        async acquirePairingLock(token, ttlMs) {
            if (lock && clock() < lock.expiresAt) return false;
            lock = { token, expiresAt: clock() + ttlMs };
            return true;
        },
        async releasePairingLock(token) {
            if (!lock || clock() >= lock.expiresAt || lock.token !== token) return false;
            lock = null;
            return true;
        },
    };
}

module.exports = { fakeMatchmakingQueue };
