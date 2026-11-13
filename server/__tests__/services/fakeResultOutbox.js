/**
 * In-memory ResultOutbox (src/repositories/gameResultOutboxRepository.js) for
 * service tests. Passes the same contract as the Redis repository
 * (repositories/gameResultOutbox.contract.test.js). Items are copied in and
 * out, as JSON through Redis would be.
 */
function fakeResultOutbox({ now = () => Date.now() } = {}) {
    const items = new Map();
    const due = new Map();
    const parked = new Map();
    const lock = { token: null, until: 0 };
    const copy = (item) => JSON.parse(JSON.stringify(item));
    const byScore = (map) => [...map.entries()].sort(([a, x], [b, y]) => x - y || (a < b ? -1 : a > b ? 1 : 0));

    return {
        items,
        async enqueue(item, dueAt) {
            if (items.has(item.gameId)) return false;
            items.set(item.gameId, copy(item));
            due.set(item.gameId, dueAt);
            return true;
        },
        async due(at, limit) {
            return byScore(due)
                .filter(([, score]) => score <= at)
                .slice(0, limit)
                .map(([id]) => copy(items.get(id)));
        },
        async reschedule(item, dueAt) {
            if (!items.has(item.gameId)) return false;
            items.set(item.gameId, copy(item));
            due.set(item.gameId, dueAt);
            return true;
        },
        async park(item, parkedAt) {
            if (!items.has(item.gameId)) return false;
            items.set(item.gameId, copy(item));
            due.delete(item.gameId);
            parked.set(item.gameId, parkedAt);
            return true;
        },
        async remove(gameId) {
            due.delete(gameId);
            parked.delete(gameId);
            return items.delete(gameId);
        },
        async requeue(gameId, dueAt) {
            if (!items.has(gameId)) return false;
            parked.delete(gameId);
            due.set(gameId, dueAt);
            return true;
        },
        async parked() {
            return byScore(parked).map(([id]) => copy(items.get(id)));
        },
        async acquireLock(token, ttlMs) {
            if (lock.token !== null && now() < lock.until) return false;
            Object.assign(lock, { token, until: now() + ttlMs });
            return true;
        },
        async releaseLock(token) {
            if (lock.token !== token || now() >= lock.until) return false;
            Object.assign(lock, { token: null, until: 0 });
            return true;
        },
    };
}

module.exports = { fakeResultOutbox };
