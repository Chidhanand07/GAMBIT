import { createBrowserClient } from '@supabase/ssr'

// Single shared instance — prevents multiple GoTrueClient refresh timers from
// running simultaneously when components each call createClient().
let _client: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (_client) return _client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      'Missing Supabase env vars. Ensure frontend/.env.local contains ' +
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY'
    )
  }

  _client = createBrowserClient(url, key)
  return _client
}
