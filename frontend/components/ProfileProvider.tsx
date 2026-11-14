'use client'

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Profile {
    id: string
    username: string
    display_name: string | null
    avatar_url: string | null
    bio: string | null
    country: string | null
    rating_rapid: number
    rating_blitz: number
    rating_bullet: number
    rating_classical: number
    games_played: number
    wins: number
    losses: number
    draws: number
    created_at: string
    [key: string]: unknown
}

interface ProfileContextValue {
    profile: Profile | null
    loading: boolean
    refetch: () => void
}

const ProfileContext = createContext<ProfileContextValue>({
    profile: null,
    loading: true,
    refetch: () => {},
})

export function useProfile() {
    return useContext(ProfileContext)
}

export default function ProfileProvider({ children }: { children: React.ReactNode }) {
    const [profile, setProfile] = useState<Profile | null>(null)
    const [loading, setLoading] = useState(true)

    // Bumped on SIGNED_OUT: a /me response requested before the sign-out is stale and must not
    // put the profile back (F17).
    const generation = useRef(0)

    const fetchProfile = useCallback(async () => {
        const requestedIn = generation.current
        const isCurrent = () => requestedIn === generation.current
        try {
            const res = await fetch('/api/profile/me')
            const next = res.ok ? await res.json() : null
            if (isCurrent()) setProfile(next)
        } catch {
            if (isCurrent()) setProfile(null)
        } finally {
            if (isCurrent()) setLoading(false)
        }
    }, [])

    useEffect(() => {
        void fetchProfile()
    }, [fetchProfile])

    // When the browser's refresh token is invalid/expired, supabase-js fires
    // SIGNED_OUT after failing to refresh. Catch that and clear profile so the
    // stale token doesn't keep hammering Supabase with 400/429 errors.
    useEffect(() => {
        const supabase = createClient()
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_OUT') {
                generation.current += 1
                setProfile(null)
                setLoading(false)
            } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                void fetchProfile()
            }
        })
        return () => subscription.unsubscribe()
    }, [fetchProfile])

    return (
        <ProfileContext.Provider value={{ profile, loading, refetch: fetchProfile }}>
            {children}
        </ProfileContext.Provider>
    )
}
