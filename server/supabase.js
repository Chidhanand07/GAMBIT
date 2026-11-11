require('dotenv').config();
const env = require('./src/config/env');
const { createSupabaseClient } = require('./src/clients/supabaseClient');

// Legacy seam: tests jest.mock('./supabase'); src/ obtains the client through this path.
const supabase = createSupabaseClient({
    url: env.supabaseUrl(),
    key: env.supabaseServiceKey(),
    keySource: env.supabaseServiceKeySource(),
});

module.exports = { supabase };
