import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

// Single shared instance — prevents multiple GoTrueClient refresh timers from
// running simultaneously when components each call createClient().
let _client: SupabaseClient | null = null

export function createClient(): SupabaseClient {
  if (_client) return _client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      'Missing Supabase env vars. Ensure frontend/.env.local contains ' +
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY'
    )
  }

  // 'raw' keeps the cookie format of existing sessions and of middleware.ts (see lib/server/supabase.ts).
  _client = createBrowserClient(url, key, { cookieEncoding: 'raw' })
  return _client
}
