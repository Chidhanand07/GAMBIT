// @ts-check
/**
 * Legacy seam: the process-wide private-game service (invite links).
 * Logic lives in src/services/privateGameService.js.
 */
const { supabase } = require('../supabase');
// Loaded after ../supabase, as the original lazy require did.
const gameStore = require('../lib/gameStore');
const { createGamesRepository } = require('../src/repositories/gamesRepository');
const { createPrivateGameService } = require('../src/services/privateGameService');

module.exports = createPrivateGameService({ gamesRepo: createGamesRepository(supabase), gameStore });
