import './globals.css'
import type { Metadata } from 'next'
import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google'
import localFont from 'next/font/local'
import SocketProvider from '@/components/SocketProvider'
import ProfileProvider from '@/components/ProfileProvider'
import PresenceProvider from '@/components/PresenceProvider'
import { ToastProvider } from '@/components/Toast'
import { SettingsProvider } from '@/features/settings/SettingsProvider'
import PageBackground from '@/components/layout/PageBackground'
import AppHeaderContainer from '@/features/navigation/components/AppHeaderContainer'
import ChallengeListener from '@/features/navigation/components/ChallengeListener'

// Redesign typography (design/HANDOFF.md §2): each family is exposed as a CSS variable that
// app/globals.css and tailwind.config.ts read (font-sans, font-display, font-mono, font-symbols).
const inter = Inter({
    subsets: ['latin'],
    weight: ['400', '500', '600'],
    display: 'swap',
    variable: '--font-inter',
})

const spaceGrotesk = Space_Grotesk({
    subsets: ['latin'],
    weight: ['500', '600', '700'],
    display: 'swap',
    variable: '--font-space-grotesk',
})

const jetbrainsMono = JetBrains_Mono({
    subsets: ['latin'],
    weight: ['500', '700'],
    display: 'swap',
    variable: '--font-jetbrains-mono',
})

/**
 * Unicode chess glyphs of the hover trail: Noto Sans Symbols 2 cut down to U+265A–265F (2 KB
 * instead of Google's 235 KB `symbols` subset; assets/fonts, OFL). Shown only under a pointer, so
 * it is not preloaded and never competes with the landing's first paint (F-111).
 */
const notoSymbols2 = localFont({
    src: '../assets/fonts/NotoSansSymbols2-chess.woff2',
    weight: '400',
    display: 'swap',
    preload: false,
    variable: '--font-noto-symbols-2',
})

const fontVariables = [inter, spaceGrotesk, jetbrainsMono, notoSymbols2].map((font) => font.variable).join(' ')

export const metadata: Metadata = {
    title: 'Gambit - Chess, perfected.',
    description: 'Premium chess platform with accuracy rating, smart matchmaking, and friend system.',
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en" className={fontVariables}>
            <body>
                <ToastProvider>
                    <SettingsProvider>
                        <ProfileProvider>
                            <PresenceProvider>
                                <SocketProvider>
                                    {/* Every mockup (signed in or not) sits on the same root, so it is
                                        mounted once here and the hover trail survives navigation. */}
                                    <PageBackground>
                                        <AppHeaderContainer />
                                        <ChallengeListener />
                                        <main className="flex-1 w-full">
                                            {children}
                                        </main>
                                    </PageBackground>
                                </SocketProvider>
                            </PresenceProvider>
                        </ProfileProvider>
                    </SettingsProvider>
                </ToastProvider>
            </body>
        </html>
    )
}
