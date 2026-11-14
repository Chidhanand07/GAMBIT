import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabasePublicKey } from './publicEnv'

// Single shared instance — prevents multiple GoTrueClient refresh timers from
// running simultaneously when components each call createClient().
let _client: SupabaseClient | null = null

export function createClient(): SupabaseClient {
  if (_client) return _client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = supabasePublicKey()

  if (!url || !key) {
    throw new Error(
      'Missing Supabase env vars. Ensure frontend/.env.local contains ' +
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ' +
      '(or the legacy NEXT_PUBLIC_SUPABASE_ANON_KEY)'
    )
  }

  // 'raw' keeps the cookie format of existing sessions and of the proxy (see lib/server/supabase.ts).
  _client = createBrowserClient(url, key, { cookieEncoding: 'raw' })
  return _client
}
