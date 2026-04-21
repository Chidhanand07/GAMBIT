require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
    console.error('[supabase] FATAL: SUPABASE_URL is not set. DB operations will fail.');
} else {
    console.log('[supabase] URL:', supabaseUrl);
}

if (!supabaseKey) {
    console.error('[supabase] FATAL: Neither SUPABASE_SERVICE_KEY nor SUPABASE_SERVICE_ROLE_KEY is set. All DB writes will fail (RLS will block them).');
} else {
    const keySource = process.env.SUPABASE_SERVICE_KEY ? 'SUPABASE_SERVICE_KEY' : 'SUPABASE_SERVICE_ROLE_KEY';
    console.log(`[supabase] Using service key from ${keySource}`);
}

const supabase = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseKey || 'placeholder',
    { auth: { autoRefreshToken: false, persistSession: false } }
);

module.exports = { supabase };
