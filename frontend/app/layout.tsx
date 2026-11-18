import './globals.css'
import type { Metadata } from 'next'
import { Inter, JetBrains_Mono, Noto_Sans_Symbols_2, Space_Grotesk } from 'next/font/google'
import SocketProvider from '@/components/SocketProvider'
import ProfileProvider from '@/components/ProfileProvider'
import PresenceProvider from '@/components/PresenceProvider'
import { ToastProvider } from '@/components/Toast'
import PageBackground from '@/components/layout/PageBackground'
import AppHeaderContainer from '@/features/navigation/components/AppHeaderContainer'

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

/** Unicode chess glyphs (hover trail, splash): U+265A–265F live in the `symbols` subset. */
const notoSymbols2 = Noto_Sans_Symbols_2({
    subsets: ['symbols'],
    weight: '400',
    display: 'swap',
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
                    <ProfileProvider>
                        <PresenceProvider>
                            <SocketProvider>
                                {/* Every mockup (signed in or not) sits on the same root, so it is
                                    mounted once here and the hover trail survives navigation. */}
                                <PageBackground>
                                    <AppHeaderContainer />
                                    <main className="flex-1 w-full">
                                        {children}
                                    </main>
                                </PageBackground>
                            </SocketProvider>
                        </PresenceProvider>
                    </ProfileProvider>
                </ToastProvider>
            </body>
        </html>
    )
}
