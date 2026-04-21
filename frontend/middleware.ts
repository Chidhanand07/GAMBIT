import { NextResponse, type NextRequest } from 'next/server'

const PROTECTED_PATHS = ['/lobby', '/game', '/profile', '/leaderboard', '/settings', '/challenge']

function getRawAuthCookie(request: NextRequest): string | null {
    const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0]
    const baseName = `sb-${ref}-auth-token`

    const single = request.cookies.get(baseName)
    if (single?.value) return single.value

    const chunks: string[] = []
    for (let i = 0; i < 10; i++) {
        const chunk = request.cookies.get(`${baseName}.${i}`)
        if (!chunk) break
        chunks.push(chunk.value)
    }
    return chunks.length > 0 ? chunks.join('') : null
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
    try {
        const part = token.split('.')[1]
        if (!part) return null
        const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
        const padded = b64 + '='.repeat((4 - b64.length % 4) % 4)
        return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
    } catch { return null }
}

function isValidSession(raw: string): boolean {
    try {
        let session: Record<string, unknown>
        try { session = JSON.parse(raw) } catch { session = JSON.parse(decodeURIComponent(raw)) }

        const token = session?.access_token as string | undefined
        if (!token || token.split('.').length !== 3) return false

        const payload = decodeJwtPayload(token)
        if (!payload) return false

        const now = Math.floor(Date.now() / 1000)
        return typeof payload.exp === 'number' && (payload.exp as number) > now - 60
    } catch { return false }
}

export async function middleware(request: NextRequest) {
    const { pathname, search } = request.nextUrl
    const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p))

    if (isProtected) {
        const tokenCookie = getRawAuthCookie(request)
        const authenticated = tokenCookie ? isValidSession(tokenCookie) : false

        console.log(`[middleware] ${pathname} — token found: ${!!tokenCookie}, valid: ${authenticated}`)

        if (!authenticated) {
            const url = request.nextUrl.clone()
            url.pathname = '/login'
            url.searchParams.set('redirect', pathname + search)
            return NextResponse.redirect(url)
        }
    }

    return NextResponse.next({ request })
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
