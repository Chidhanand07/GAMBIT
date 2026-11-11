// Legacy seam: the process-wide game-state repository (one shared lock map),
// built over the ioredis instance that tests replace with jest.mock('./redis').
const redis = require('./redis')
const { createGameStateRepository } = require('../src/repositories/gameStateRepository')

const { getGame, setGame, updateGame, deleteGame, addActiveGame, removeActiveGame, getActiveGameIds } =
    createGameStateRepository(redis)

module.exports = { getGame, setGame, updateGame, deleteGame, addActiveGame, removeActiveGame, getActiveGameIds }
