import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Navbar from '@/components/Navbar'
import SocketProvider from '@/components/SocketProvider'
import ProfileProvider from '@/components/ProfileProvider'
import PresenceProvider from '@/components/PresenceProvider'
import { ToastProvider } from '@/components/Toast'
import IntroGate from '@/components/IntroGate'

const inter = Inter({
    subsets: ['latin'],
    weight: ['400', '500'],
    display: 'swap',
    variable: '--font-inter',
})

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
        <html lang="en" className={inter.variable}>
            <body>
                <ToastProvider>
                    <ProfileProvider>
                        <PresenceProvider>
                            <SocketProvider>
                                <IntroGate>
                                    <Navbar />
                                    <main className="flex-1 w-full bg-page">
                                        {children}
                                    </main>
                                </IntroGate>
                            </SocketProvider>
                        </PresenceProvider>
                    </ProfileProvider>
                </ToastProvider>
            </body>
        </html>
    )
}
