// @ts-check
/**
 * `user_preferences` reads (ADR F-140; see gamesRepository for the return
 * convention). The game server only reads preferences to enforce them; the
 * table grants it SELECT and nothing else.
 */
const { PREFERENCE_COLUMNS } = require('../domain/preferences');

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
function createPreferencesRepository(supabase) {
    return {
        /**
         * The enforced preference columns of these users (users without a row are absent).
         * @param {string[]} userIds
         */
        findByUserIds: (userIds) => supabase.from('user_preferences').select(PREFERENCE_COLUMNS).in('user_id', userIds),
    };
}

module.exports = { createPreferencesRepository };
