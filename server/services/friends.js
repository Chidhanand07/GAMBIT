// @ts-check
/**
 * Legacy seam: the process-wide private-game service (invite links).
 * Logic lives in src/services/privateGameService.js.
 */
const gameStore = require('../lib/gameStore');
const { supabase } = require('../supabase');
const { createGamesRepository } = require('../src/repositories/gamesRepository');
const { createPrivateGameService } = require('../src/services/privateGameService');

module.exports = createPrivateGameService({ gamesRepo: createGamesRepository(supabase), gameStore });
