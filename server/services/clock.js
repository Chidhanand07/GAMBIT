const { getGame, setGame, getActiveGameIds, removeActiveGame } = require('../lib/gameStore')
const { supabase } = require('../supabase')

let globalTicker = null

function parseIncrement(timeControl) {
    const parts = String(timeControl || '0').split('+')
    return (parseInt(parts[1]) || 0) * 1000
}

async function finalizeExpiredGame(io, gameId, game, winnerId, reason) {
    const outcome = winnerId === game.whiteId ? 'white' : 'black'

    const { data: updated } = await supabase.from('games')
        .update({ status: 'completed', winner_id: winnerId, ended_at: new Date().toISOString(), final_fen: game.fen ?? null })
        .eq('id', gameId).eq('status', 'active').select('id').maybeSingle()

    if (!updated) return // already finalized

    try {
        const ratingService = require('./rating')
        const changes = await ratingService.processGameEnd(
            gameId, game.whiteId, game.blackId, outcome, game.timeControl, game.isRated
        )
        if (changes) io.to(`game_${gameId}`).emit('rating_updated', changes)
    } catch (e) {
        console.error('[clock] rating error:', e.message)
    }
}

function startGlobalClock(io) {
    if (globalTicker) return

    globalTicker = setInterval(async () => {
        try {
            const gameIds = await getActiveGameIds()
            if (!gameIds.length) return

            await Promise.all(gameIds.map(async (gameId) => {
                try {
                    const game = await getGame(gameId)
                    if (!game || game.status !== 'active' || !game.lastMoveAt) return

                    const now = Date.now()
                    const elapsed = now - game.lastMoveAt
                    const side = game.activeSide

                    // Real remaining for the active player
                    const remaining = side === 'w'
                        ? Math.max(0, game.whiteClockMs - elapsed)
                        : Math.max(0, game.blackClockMs - elapsed)

                    const wMs = side === 'w' ? remaining : game.whiteClockMs
                    const bMs = side === 'b' ? remaining : game.blackClockMs

                    io.to(`game_${gameId}`).emit('clock_sync', { whiteMs: wMs, blackMs: bMs, serverTs: now })

                    // ── Disconnect grace period check (20 s) ──
                    if (game.disconnectInfo) {
                        const disconnectElapsed = now - game.disconnectInfo.at
                        if (disconnectElapsed >= 20000) {
                            const loserSide = game.disconnectInfo.side
                            const loserId = loserSide === 'white' ? game.whiteId : game.blackId
                            const winnerId = loserSide === 'white' ? game.blackId : game.whiteId
                            const result = loserSide === 'white' ? 'Black wins' : 'White wins'

                            await setGame(gameId, { ...game, status: 'completed', result: loserSide === 'white' ? 'black' : 'white' })
                            await removeActiveGame(gameId)

                            io.to(`game_${gameId}`).emit('game_end', {
                                game_id: gameId, result, reason: 'Abandonment',
                                white_id: game.whiteId, black_id: game.blackId,
                            })
                            await finalizeExpiredGame(io, gameId, game, winnerId, 'abandonment')
                        }
                        return // clock paused while opponent is disconnected
                    }

                    // ── Clock timeout ──
                    if (remaining <= 0) {
                        const loserIsWhite = side === 'w'
                        const winnerId = loserIsWhite ? game.blackId : game.whiteId
                        const result = loserIsWhite ? 'Black wins' : 'White wins'

                        await setGame(gameId, { ...game, status: 'completed', result: loserIsWhite ? 'black' : 'white' })
                        await removeActiveGame(gameId)

                        io.to(`game_${gameId}`).emit('game_end', {
                            game_id: gameId, result, reason: 'Time',
                            white_id: game.whiteId, black_id: game.blackId,
                            is_rated: game.isRated, time_control: game.timeControl,
                        })
                        await finalizeExpiredGame(io, gameId, game, winnerId, 'time')
                    }
                } catch (e) {
                    console.error(`[clock] game ${gameId} error:`, e.message)
                }
            }))
        } catch (e) {
            console.error('[clock] ticker error:', e.message)
        }
    }, 1000)

    console.log('[Clock] Global ticker started')
}

function stopGlobalClock() {
    if (globalTicker) { clearInterval(globalTicker); globalTicker = null }
}

module.exports = { startGlobalClock, stopGlobalClock, finalizeExpiredGame, parseIncrement }
