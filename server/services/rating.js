// @ts-check
/**
 * Legacy seam: the process-wide rating service (tests jest.mock this path).
 * Logic lives in src/services/ratingService.js.
 */
const { supabase } = require('../supabase');
const { createProfilesRepository } = require('../src/repositories/profilesRepository');
const { createRatingService } = require('../src/services/ratingService');

module.exports = createRatingService({ profilesRepo: createProfilesRepository(supabase) });
