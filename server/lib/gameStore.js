const redis = require('./redis')

const GAME_TTL = 86400 // 24 hours
const ACTIVE_SET = 'active_games'

function gameKey(gameId) { return `game:${gameId}` }

// C8 fix: per-game mutex — chains Promises so concurrent updateGame calls for
// the same gameId are serialized, preventing stale-read overwrites.
const _locks = new Map()

async function withGameLock(gameId, fn) {
    const prev = _locks.get(gameId) ?? Promise.resolve()
    let resolve
    const next = new Promise(r => { resolve = r })
    _locks.set(gameId, next)
    try {
        await prev
        return await fn()
    } finally {
        resolve()
        // Only clean up if our promise is still the tail (no newer waiter)
        if (_locks.get(gameId) === next) _locks.delete(gameId)
    }
}

async function getGame(gameId) {
    try {
        const raw = await redis.get(gameKey(gameId))
        if (!raw) return null
        return JSON.parse(raw)
    } catch (e) {
        console.error('[gameStore] getGame error:', e.message)
        return null
    }
}

async function setGame(gameId, game) {
    try {
        await redis.setex(gameKey(gameId), GAME_TTL, JSON.stringify(game))
    } catch (e) {
        console.error('[gameStore] setGame error:', e.message)
    }
    return game
}

async function updateGame(gameId, updates) {
    return withGameLock(gameId, async () => {
        const game = await getGame(gameId)
        if (!game) throw new Error(`Game ${gameId} not found in Redis`)
        const updated = { ...game, ...updates }
        await setGame(gameId, updated)
        return updated
    })
}

async function deleteGame(gameId) {
    try {
        await redis.del(gameKey(gameId))
    } catch (e) {
        console.error('[gameStore] deleteGame error:', e.message)
    }
}

async function addActiveGame(gameId) {
    try {
        await redis.sadd(ACTIVE_SET, gameId)
    } catch (e) {
        console.error('[gameStore] addActiveGame error:', e.message)
    }
}

async function removeActiveGame(gameId) {
    try {
        await redis.srem(ACTIVE_SET, gameId)
    } catch (e) {
        console.error('[gameStore] removeActiveGame error:', e.message)
    }
}

async function getActiveGameIds() {
    try {
        return await redis.smembers(ACTIVE_SET)
    } catch (e) {
        console.error('[gameStore] getActiveGameIds error:', e.message)
        return []
    }
}

module.exports = { getGame, setGame, updateGame, deleteGame, addActiveGame, removeActiveGame, getActiveGameIds }
