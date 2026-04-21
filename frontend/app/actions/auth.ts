'use server'
import { createServerClient } from '@supabase/ssr'

export async function createProfile({ userId, username, email }: { userId: string, username: string, email: string }) {
  const admin = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => { } } }
  )

  const { error } = await admin.from('profiles').insert({
    id: userId,
    username,
    email,
    rating_bullet: 1200,
    rating_blitz: 1200,
    rating_rapid: 1200,
    rating_classical: 1200,
    games_played: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    created_at: new Date().toISOString(),
  })

  if (error) return { error: error.message }
  return { success: true }
}
