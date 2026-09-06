import { NextResponse } from 'next/server'

// POST /api/maverick-move — proxies to the chess-engine /computer-move endpoint so
// the browser never needs the engine URL directly (avoids CORS + keeps it server-side).
// Body: { fen: string, difficulty: 'easy' | 'medium' | 'hard' }
// Returns: { uci, san, difficulty }

const ENGINE_URL = process.env.ENGINE_URL || 'http://localhost:8001'

export async function POST(req: Request) {
    let body: { fen?: string; difficulty?: string }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (!body?.fen) {
        return NextResponse.json({ error: 'Missing fen' }, { status: 400 })
    }

    const difficulty = ['easy', 'medium', 'hard'].includes(body.difficulty || '')
        ? body.difficulty
        : 'medium'

    try {
        const res = await fetch(`${ENGINE_URL}/computer-move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fen: body.fen, difficulty }),
        })
        if (!res.ok) {
            const detail = await res.text().catch(() => '')
            return NextResponse.json(
                { error: 'Engine error', detail },
                { status: res.status === 400 ? 400 : 502 },
            )
        }
        const data = await res.json()
        return NextResponse.json(data)
    } catch (e: any) {
        return NextResponse.json(
            { error: 'Engine unreachable', detail: e?.message ?? String(e) },
            { status: 502 },
        )
    }
}
