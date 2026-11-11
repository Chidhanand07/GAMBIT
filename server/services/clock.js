const { getGame, setGame, getActiveGameIds, removeActiveGame } = require('../lib/gameStore')
const { supabase } = require('../supabase')
const gamesRepo = require('../src/repositories/gamesRepository').createGamesRepository(supabase)
const { parseIncrementMs } = require('../src/domain/timeControl')
const { tickerSnapshot, isGraceExpired } = require('../src/domain/clock')
const { resultLabel, opponentColor, sideToColor, colorOfPlayer, playerIdOf } = require('../src/domain/result')

let globalTicker = null

function parseIncrement(timeControl) {
    return parseIncrementMs(timeControl)
}

async function finalizeExpiredGame(io, gameId, game, winnerId, reason) {
    const outcome = colorOfPlayer(winnerId, game.whiteId)

    const { data: updated } = await gamesRepo.finishIfActive(gameId,
        { status: 'completed', winner_id: winnerId, ended_at: new Date().toISOString(), final_fen: game.fen ?? null })

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
                    // Real remaining for the active player
                    const { remainingMs: remaining, whiteMs: wMs, blackMs: bMs } = tickerSnapshot(game, now)

                    io.to(`game_${gameId}`).emit('clock_sync', { whiteMs: wMs, blackMs: bMs, serverTs: now })

                    // ── Disconnect grace period check (20 s) ──
                    if (game.disconnectInfo) {
                        if (isGraceExpired(game.disconnectInfo, now)) {
                            const winnerColor = opponentColor(game.disconnectInfo.side)
                            const winnerId = playerIdOf(winnerColor, game)
                            const result = resultLabel(winnerColor)

                            await setGame(gameId, { ...game, status: 'completed', result: winnerColor })
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
                        const winnerColor = opponentColor(sideToColor(game.activeSide))
                        const winnerId = playerIdOf(winnerColor, game)
                        const result = resultLabel(winnerColor)

                        await setGame(gameId, { ...game, status: 'completed', result: winnerColor })
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
