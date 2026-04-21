"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Chess, Square, Color } from 'chess.js';
import { Flag, ChevronLeft, ChevronRight, SkipBack, SkipForward, RotateCcw, Volume2, VolumeX, Send, Undo2, Crown, Trophy } from 'lucide-react';
import { playMoveSound, playCaptureSound, playCastleSound, playCheckSound, playCheckmateSound, playPromoteSound, playGameStartSound, playGameEndSound } from '@/lib/sounds';
import { useSocket } from '@/components/SocketProvider';
import { useProfile } from '@/components/ProfileProvider';

// ── Piece images (chess.com classic set) ─────────────────────────────────────
function Piece({ color, type }: { color: Color; type: string }) {
    const file = `/pieces/classic/${color}${type.toLowerCase()}.png`
    return (
        <img
            src={file}
            alt={`${color}${type}`}
            draggable={false}
            className="select-none pointer-events-none w-[82%] h-[82%] object-contain"
            style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}
        />
    )
}

function sqToCoords(sq: string): [number, number] {
    return [sq.charCodeAt(0) - 97, parseInt(sq[1]) - 1]
}
function coordsToSq(file: number, rank: number): Square {
    return `${String.fromCharCode(97 + file)}${rank + 1}` as Square
}
function fmtTime(s: number): string {
    const m = Math.floor(Math.abs(s) / 60).toString().padStart(2, '0')
    const ss = (Math.abs(s) % 60).toString().padStart(2, '0')
    return `${m}:${ss}`
}

// ── Rating change animation ───────────────────────────────────────────────────
function RatingBadge({ change }: { change: number | null }) {
    if (change === null) return null
    const positive = change >= 0
    return (
        <span className={`text-xs font-medium tabular-nums ml-1 ${positive ? 'text-green-400' : 'text-red-400'}`}>
            {positive ? '+' : ''}{change}
        </span>
    )
}

// ── Profile strip ─────────────────────────────────────────────────────────────
function PlayerStrip({
    player, time, isActive, isBottom, ratingChange, isMe, timeControl
}: {
    player: any; time: number; isActive: boolean; isBottom: boolean; ratingChange: number | null; isMe?: boolean; timeControl?: string
}) {
    const getFormatRating = (p: any, tc?: string) => {
        if (!p) return 1200;
        let mins = 10;
        if (tc) {
            mins = tc.includes('+') ? parseInt(tc.split('+')[0], 10) : parseInt(tc, 10);
            if (isNaN(mins)) mins = 10;
        }
        if (mins < 3) return Math.round(p.rating_bullet ?? 1200);
        if (mins < 10) return Math.round(p.rating_blitz ?? 1200);
        if (mins >= 30) return Math.round(p.rating_classical ?? 1200);
        return Math.round(p.rating_rapid ?? 1200);
    };
    const rating = getFormatRating(player, timeControl);
    const username = player?.username
    const isCritical = time < 30 && isActive
    return (
        <div className={`flex justify-between items-center px-4 transition-colors ${isBottom ? 'rounded-b-xl border-t-0' : 'rounded-t-xl'}`}
            style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border)', height: 52 }}>
            <div className="flex items-center gap-3">
                {username ? (
                    <Link href={`/profile/${username}`}
                        className="w-9 h-9 rounded-full flex items-center justify-center overflow-hidden shrink-0"
                        style={{ background: 'var(--accent-dim)', border: '1px solid var(--border-accent)' }}>
                        {player?.avatar_url
                            ? <img src={player.avatar_url} alt="" className="w-full h-full object-cover" />
                            : <span className="text-accent font-semibold text-sm">{username[0].toUpperCase()}</span>}
                    </Link>
                ) : (
                    <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: 'var(--bg-surface)', border: '0.5px solid var(--border)' }}>
                        <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>?</span>
                    </div>
                )}
                <div>
                    <div className="font-medium text-sm leading-none flex items-center gap-1.5" style={{ color: 'var(--text-primary)' }}>
                        {username
                            ? <Link href={`/profile/${username}`} className="hover:text-accent transition-colors">{player?.display_name || username}</Link>
                            : <span style={{ color: 'var(--text-tertiary)' }}>Waiting…</span>}
                        {isMe && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: 'var(--text-tertiary)', background: 'var(--bg-elevated)', border: '0.5px solid var(--border)' }}>You</span>}
                    </div>
                    <div className="text-xs mt-0.5 flex items-center gap-1 tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
                        {rating}
                        {ratingChange !== null && (
                            <span className={ratingChange >= 0 ? 'text-green-400' : 'text-red-400'} style={{ fontSize: 11 }}>
                                {ratingChange >= 0 ? '+' : ''}{ratingChange}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Clock */}
            <div className={`px-4 py-2 rounded-lg font-mono text-xl tabular-nums transition-all ${isCritical ? 'clock-critical' : ''}`}
                style={{
                    background: isCritical ? 'rgba(192,57,43,0.15)' :
                                isMe && isActive ? 'var(--accent-dim)' :
                                isActive ? 'var(--bg-active)' : 'var(--bg-surface)',
                    border: isCritical ? '0.5px solid rgba(192,57,43,0.4)' :
                            isMe && isActive ? '1.5px solid var(--accent)' :
                            isActive ? '0.5px solid var(--border-accent)' : '0.5px solid var(--border)',
                    color: isCritical ? '#E74C3C' :
                           isMe && isActive ? 'var(--accent)' :
                           isActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
                }}>
                {fmtTime(time)}
            </div>
        </div>
    )
}

// ── Promotion modal ───────────────────────────────────────────────────────────
const PROMO_PIECES = [
    { type: 'q', name: 'Queen' },
    { type: 'r', name: 'Rook' },
    { type: 'b', name: 'Bishop' },
    { type: 'n', name: 'Knight' },
] as const

function PromotionModal({ color, onSelect }: { color: 'white' | 'black'; onSelect: (p: string) => void }) {
    const c = color === 'white' ? 'w' : 'b'
    return (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-50">
            <div className="bg-surface border border-border rounded-xl p-4 shadow-2xl">
                <div className="text-text-secondary text-xs uppercase tracking-wider text-center mb-3">Choose promotion</div>
                <div className="grid grid-cols-4 gap-2">
                    {PROMO_PIECES.map(p => (
                        <button key={p.type} onClick={() => onSelect(p.type)}
                            className="w-14 h-14 flex flex-col items-center justify-center rounded-lg bg-elevated border border-border hover:border-accent hover:bg-accent/10 transition-all group">
                            <img src={`/pieces/classic/${c}${p.type}.png`} alt={p.name}
                                className="w-9 h-9 object-contain" draggable={false}
                                style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.5))' }} />
                            <span className="text-[10px] text-text-tertiary group-hover:text-accent mt-0.5">{p.name}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function GamePage({ params }: { params: { id: string } }) {
    const router = useRouter()
    const socket = useSocket()

    const chessRef = useRef(new Chess())
    const [fen, setFen] = useState(new Chess().fen())
    const [gameData, setGameData] = useState<any>(null)
    const gameDataRef = useRef<any>(null)
    const { profile: myProfile } = useProfile()
    const [myColor, setMyColor] = useState<'white' | 'black' | 'spectator'>('spectator')
    const [selectedSq, setSelectedSq] = useState<Square | null>(null)
    const [legalDests, setLegalDests] = useState<Square[]>([])
    const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null)
    const [moveList, setMoveList] = useState<string[]>([])
    const [fenSnapshots, setFenSnapshots] = useState<string[]>([])
    const [viewIndex, setViewIndex] = useState<number | null>(null) // null = live
    const [flipped, setFlipped] = useState(false)
    const [soundOn, setSoundOn] = useState(true)
    const [activeTab, setActiveTab] = useState<'Moves' | 'Engine' | 'Chat'>('Moves')
    const [chatMsg, setChatMsg] = useState('')
    const [chatLog, setChatLog] = useState<{ from: string; text: string }[]>([{ from: 'System', text: 'Game started. Good luck!' }])
    const [connected, setConnected] = useState(true)
    const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null)

    // Rating changes from server
    const [whiteRatingChange, setWhiteRatingChange] = useState<number | null>(null)
    const [blackRatingChange, setBlackRatingChange] = useState<number | null>(null)

    // Show/hide the game-over modal (Review dismisses it but keeps gameOver for other logic)
    const [showGameOverModal, setShowGameOverModal] = useState(false)

    // Clocks
    const [whiteTime, setWhiteTime] = useState(600)
    const [blackTime, setBlackTime] = useState(600)
    const clockRef = useRef<ReturnType<typeof setInterval> | null>(null)
    // Tracks whether clock_sync already arrived — prevents game-load fetch from overwriting it
    const clockSyncedRef = useRef(false)

    // Game over
    const [gameOver, setGameOver] = useState<{ result: string; reason: string } | null>(null)
    const moveListRef = useRef<HTMLDivElement>(null)

    // Rematch flow
    const [rematchState, setRematchState] = useState<'idle' | 'sent' | 'received' | 'declined'>('idle')
    const [rematchFromUser, setRematchFromUser] = useState<string>('')

    // Resign confirmation
    const [resignConfirm, setResignConfirm] = useState(false)

    // Opponent disconnect
    const [opponentDisconnected, setOpponentDisconnected] = useState(false)
    const [disconnectCountdown, setDisconnectCountdown] = useState(0)

    // Clock active — server sets this to true after the first move; prevents pre-move countdown
    const [clockActive, setClockActive] = useState(false)

    // Deduplicates move_made events (prevents double-move from duplicate socket listeners)
    const lastProcessedFenRef = useRef<string | null>(null)

    // Refs for stable arrow key handler
    const viewIndexRef = useRef<number | null>(null)
    const fenSnapshotsLenRef = useRef<number>(0)

    // Sync refs for stable keydown handler
    viewIndexRef.current = viewIndex
    fenSnapshotsLenRef.current = fenSnapshots.length

    // ── Display chess (for history navigation) ─────────────────────────────
    const displayFen = viewIndex !== null ? fenSnapshots[viewIndex] : fen
    const displayChess = useMemo(() => {
        const c = new Chess()
        try { c.load(displayFen) } catch { /* ignore */ }
        return c
    }, [displayFen])

    const isLive = viewIndex === null

    // ── localStorage persistence ─────────────────────────────────────────────
    const lsKey = `gambit-game-${params.id}`

    const persistHistory = useCallback((snaps: string[], moves: string[], lm: { from: Square; to: Square } | null) => {
        try {
            localStorage.setItem(lsKey, JSON.stringify({ fenSnapshots: snaps, moveList: moves, lastMove: lm }))
        } catch { /* storage full or unavailable */ }
    }, [lsKey])

    // Restore move history from localStorage on first mount (before socket events arrive)
    useEffect(() => {
        try {
            const raw = localStorage.getItem(lsKey)
            if (!raw) return
            const saved = JSON.parse(raw)
            if (saved.fenSnapshots?.length > 0) {
                setFenSnapshots(saved.fenSnapshots)
                setMoveList(saved.moveList ?? [])
                setLastMove(saved.lastMove ?? null)
                const latestFen = saved.fenSnapshots[saved.fenSnapshots.length - 1]
                chessRef.current.load(latestFen)
                setFen(latestFen)
            }
        } catch { /* corrupt data, ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Persist move history whenever it changes
    useEffect(() => {
        if (fenSnapshots.length > 0) {
            persistHistory(fenSnapshots, moveList, lastMove)
        }
    }, [fenSnapshots, moveList, lastMove, persistHistory])

    // ── Arrow key navigation ─────────────────────────────────────────────────
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement)?.tagName
            if (tag === 'INPUT' || tag === 'TEXTAREA') return
            const vi = viewIndexRef.current
            const len = fenSnapshotsLenRef.current
            if (e.key === 'ArrowLeft') {
                e.preventDefault()
                if (len === 0) return
                setViewIndex(Math.max(0, (vi ?? len) - 1))
                setSelectedSq(null)
                setLegalDests([])
            } else if (e.key === 'ArrowRight') {
                e.preventDefault()
                if (len === 0) return
                const next = (vi ?? -1) + 1
                setViewIndex(next >= len ? null : next)
                setSelectedSq(null)
                setLegalDests([])
            }
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [])

    // ── Load game data ──────────────────────────────────────────────────────
    useEffect(() => {
        fetch(`/api/games/${params.id}`).then(r => r.ok ? r.json() : null).then(gd => {
            if (!gd) { router.push('/lobby'); return }
            setGameData(gd)
            gameDataRef.current = gd
            if (myProfile) {
                if (gd.white_id === myProfile.id) { setMyColor('white'); setFlipped(false) }
                else if (gd.black_id === myProfile.id) { setMyColor('black'); setFlipped(true) }
                else setMyColor('spectator')
            }
            const startingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
            const isResume = !!(gd.fen && gd.fen !== startingFen)
            if (gd.fen) { chessRef.current.load(gd.fen); setFen(gd.fen) }
            const mins = parseInt(gd.time_control) || 10
            // Only preset clock if clock_sync hasn't arrived yet (prevents overwriting the synced value)
            if (!clockSyncedRef.current) {
                setWhiteTime(mins * 60)
                setBlackTime(mins * 60)
            }
            if (soundOn && !isResume) playGameStartSound()
        })
    }, [params.id])

    useEffect(() => {
        if (!gameData || !myProfile) return
        if (gameData.white_id === myProfile.id) { setMyColor('white'); setFlipped(false) }
        else if (gameData.black_id === myProfile.id) { setMyColor('black'); setFlipped(true) }
        else setMyColor('spectator')
    }, [myProfile?.id, gameData])

    // Auto-scroll move list to bottom
    useEffect(() => {
        if (moveListRef.current && isLive) {
            moveListRef.current.scrollTop = moveListRef.current.scrollHeight
        }
    }, [moveList, isLive])

    // Show game-over modal when game ends (small delay so board updates first)
    useEffect(() => {
        if (gameOver) {
            const t = setTimeout(() => setShowGameOverModal(true), 400)
            return () => clearTimeout(t)
        }
    }, [gameOver])

    // ── Socket setup ─────────────────────────────────────────────────────────
    useEffect(() => {
        if (!socket || !myProfile) return

        socket.emit('authenticate', myProfile.id)
        socket.emit('join_game', params.id)

        const onDisconnect = () => setConnected(false)
        const onConnect = () => {
            // Fires on initial connect AND on every reconnect — re-join is idempotent
            setConnected(true)
            socket.emit('authenticate', myProfile.id)
            socket.emit('join_game', params.id)
        }
        socket.on('disconnect', onDisconnect)
        socket.on('connect', onConnect)

        const onGameStateSync = (data: {
            fen: string; moveLog: { move: string; fen: string; san: string }[];
            whiteMs: number; blackMs: number; activeSide: string;
            clockActive: boolean; whiteId: string; blackId: string;
        }) => {
            chessRef.current.load(data.fen)
            setFen(data.fen)
            lastProcessedFenRef.current = data.fen
            if (data.moveLog?.length > 0) {
                const snaps = data.moveLog.map(m => m.fen).filter(Boolean)
                const sans = data.moveLog.map(m => m.san).filter(Boolean)
                setFenSnapshots(snaps)
                setMoveList(sans)
            }
            setWhiteTime(Math.round(data.whiteMs / 1000))
            setBlackTime(Math.round(data.blackMs / 1000))
            clockSyncedRef.current = true
            setClockActive(data.clockActive)
        }

        const onMoveMade = (data: { game_id: string; from: string; to: string; promotion?: string; fen: string; san: string; captured?: boolean; flags?: string; whiteMs?: number; blackMs?: number }) => {
            if (data.game_id !== params.id) return
            // Deduplicate: same FEN means this event already processed (duplicate socket listener)
            if (data.fen === lastProcessedFenRef.current) return
            lastProcessedFenRef.current = data.fen
            setClockActive(true)
            chessRef.current.load(data.fen)
            setFen(data.fen)
            setFenSnapshots(prev => [...prev, data.fen])
            setViewIndex(null) // snap to live
            setLastMove({ from: data.from as Square, to: data.to as Square })
            setMoveList(prev => [...prev, data.san])
            setSelectedSq(null)
            setLegalDests([])
            if (data.whiteMs !== undefined) setWhiteTime(Math.round(data.whiteMs / 1000))
            if (data.blackMs !== undefined) setBlackTime(Math.round(data.blackMs / 1000))

            if (soundOn) {
                if (chessRef.current.isCheckmate()) playCheckmateSound()
                else if (chessRef.current.inCheck()) playCheckSound()
                else if (data.flags && (data.flags.includes('k') || data.flags.includes('q'))) playCastleSound()
                else if (data.flags && data.flags.includes('p')) playPromoteSound()
                else if (data.captured) playCaptureSound()
                else playMoveSound()
            }

            if (chessRef.current.isGameOver()) {
                const c = chessRef.current
                const result = c.isCheckmate()
                    ? (c.turn() === 'w' ? 'Black wins' : 'White wins')
                    : 'Draw'
                const reason = c.isCheckmate() ? 'Checkmate' : c.isStalemate() ? 'Stalemate' : 'Draw'
                setGameOver({ result, reason })
                if (soundOn) playGameEndSound(myColor !== 'spectator' && ((c.turn() === 'w' ? 'black' : 'white') === myColor))
            }
        }

        const onChatMessage = (data: { game_id: string; from: string; text: string }) => {
            if (data.game_id !== params.id) return
            setChatLog(prev => [...prev, { from: data.from, text: data.text }])
        }

        const onGameEnd = (data: { game_id: string; result: string; reason: string }) => {
            if (data.game_id !== params.id) return
            setGameOver({ result: data.result, reason: data.reason })
            if (soundOn) playGameEndSound(data.result.toLowerCase().startsWith(myColor))
        }

        const onRatingUpdated = (data: {
            white: { oldRating: number; newRating: number; change: number }
            black: { oldRating: number; newRating: number; change: number }
        }) => {
            setWhiteRatingChange(data.white.change)
            setBlackRatingChange(data.black.change)
        }

        const onRematchRequest = (data: { from_user_id: string; from_username: string }) => {
            setRematchFromUser(data.from_username)
            setRematchState('received')
            // Auto-dismiss after 30 s if not acted on
            setTimeout(() => setRematchState(prev => prev === 'received' ? 'idle' : prev), 30_000)
        }

        const onRematchReady = (data: { game_id: string }) => {
            router.push(`/game/${data.game_id}`)
        }

        const onRematchDeclined = () => {
            setRematchState('declined')
        }

        const onOpponentDisconnected = (data: { timeoutSeconds: number }) => {
            setOpponentDisconnected(true)
            setDisconnectCountdown(data.timeoutSeconds ?? 20)
        }

        const onOpponentReconnected = () => {
            setOpponentDisconnected(false)
            setDisconnectCountdown(0)
        }

        const onClockSync = (data: { whiteMs: number; blackMs: number; serverTs?: number }) => {
            clockSyncedRef.current = true
            // M1: compensate for network lag so the display doesn't jump
            const lag = data.serverTs ? Math.max(0, Date.now() - data.serverTs) : 0
            const turn = chessRef.current?.turn() ?? 'w'
            const adjWhite = Math.max(0, data.whiteMs - (turn === 'w' ? lag : 0))
            const adjBlack = Math.max(0, data.blackMs - (turn === 'b' ? lag : 0))
            // Only hard-override if server disagrees by >500 ms — avoids jitter flicker
            setWhiteTime(prev => {
                const server = Math.round(adjWhite / 1000)
                return Math.abs(prev - server) > 0 ? server : prev
            })
            setBlackTime(prev => {
                const server = Math.round(adjBlack / 1000)
                return Math.abs(prev - server) > 0 ? server : prev
            })
        }

        socket.on('game_state_sync', onGameStateSync)
        socket.on('move_made', onMoveMade)
        socket.on('chat_message', onChatMessage)
        socket.on('game_end', onGameEnd)
        socket.on('rating_updated', onRatingUpdated)
        socket.on('rematch_request', onRematchRequest)
        socket.on('rematch_ready', onRematchReady)
        socket.on('rematch_declined', onRematchDeclined)
        socket.on('opponent_disconnected', onOpponentDisconnected)
        socket.on('opponent_reconnected', onOpponentReconnected)
        socket.on('clock_sync', onClockSync)

        return () => {
            socket.off('disconnect', onDisconnect)
            socket.off('connect', onConnect)
            socket.off('game_state_sync', onGameStateSync)
            socket.off('move_made', onMoveMade)
            socket.off('chat_message', onChatMessage)
            socket.off('game_end', onGameEnd)
            socket.off('rating_updated', onRatingUpdated)
            socket.off('rematch_request', onRematchRequest)
            socket.off('rematch_ready', onRematchReady)
            socket.off('rematch_declined', onRematchDeclined)
            socket.off('opponent_disconnected', onOpponentDisconnected)
            socket.off('opponent_reconnected', onOpponentReconnected)
            socket.off('clock_sync', onClockSync)
        }
    }, [socket, myProfile, params.id, myColor, soundOn])

    // ── Clock tick (display only — server handles expiry) ────────────────────
    // The turn token is the 2nd space-delimited field: 'w' or 'b'.
    const currentTurn = fen.split(' ')[1] as 'w' | 'b'
    useEffect(() => {
        if (clockRef.current) clearInterval(clockRef.current)
        // Only tick when clock has been started by the server (after first move)
        if (gameOver || !gameData || opponentDisconnected || !clockActive) return
        clockRef.current = setInterval(() => {
            if (currentTurn === 'w') setWhiteTime(t => Math.max(0, t - 1))
            else setBlackTime(t => Math.max(0, t - 1))
        }, 1000)
        return () => { if (clockRef.current) clearInterval(clockRef.current) }
    }, [currentTurn, gameOver, gameData, opponentDisconnected, clockActive])

    // ── Opponent disconnect countdown (independent of socket effect) ─────────
    useEffect(() => {
        if (!opponentDisconnected || disconnectCountdown <= 0) return
        const id = setInterval(() => {
            setDisconnectCountdown(prev => {
                if (prev <= 1) { clearInterval(id); return 0 }
                return prev - 1
            })
        }, 1000)
        return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opponentDisconnected]) // intentionally omit disconnectCountdown to avoid restart on each tick

    // ── Move handling ────────────────────────────────────────────────────────
    const isMyTurn = useCallback(() => {
        if (myColor === 'spectator' || gameOver || !isLive) return false
        const turn = chessRef.current.turn()
        return (turn === 'w' && myColor === 'white') || (turn === 'b' && myColor === 'black')
    }, [myColor, fen, gameOver, isLive])

    const commitMove = useCallback((from: Square, to: Square, promotion: string) => {
        const chess = chessRef.current
        const moveObj = chess.move({ from, to, promotion })
        if (!moveObj) return

        const newFen = chess.fen()
        setFen(newFen)
        setLastMove({ from, to })
        setSelectedSq(null)
        setLegalDests([])
        setPendingPromotion(null)

        socket?.emit('make_move', {
            game_id: params.id, from, to, promotion,
            fen: newFen, san: moveObj.san, captured: !!moveObj.captured,
        })

        if (soundOn) {
            if (chess.isCheckmate()) playCheckmateSound()
            else if (chess.inCheck()) playCheckSound()
            else if (moveObj.flags && (moveObj.flags.includes('k') || moveObj.flags.includes('q'))) playCastleSound()
            else if (moveObj.flags && moveObj.flags.includes('p')) playPromoteSound()
            else if (moveObj.captured) playCaptureSound()
            else playMoveSound()
        }

        if (chess.isGameOver()) {
            const result = chess.isCheckmate()
                ? (chess.turn() === 'w' ? 'Black wins' : 'White wins')
                : 'Draw'
            const reason = chess.isCheckmate() ? 'Checkmate' : chess.isStalemate() ? 'Stalemate' : 'Draw'
            setGameOver({ result, reason })
            socket?.emit('game_end', {
                game_id: params.id, result, reason,
                white_id: gameDataRef.current?.white_id,
                black_id: gameDataRef.current?.black_id,
                is_rated: gameDataRef.current?.is_rated ?? false,
                time_control: gameDataRef.current?.time_control ?? '10',
            })
            if (soundOn) playGameEndSound(result.toLowerCase().startsWith(myColor))
        }
    }, [socket, params.id, myColor, soundOn])

    const handleSquareClick = useCallback((sq: Square) => {
        if (!isMyTurn()) return
        const chess = chessRef.current

        if (selectedSq) {
            if (legalDests.includes(sq)) {
                const piece = chess.get(selectedSq)
                const isPromotion = piece?.type === 'p' &&
                    ((piece.color === 'w' && sq[1] === '8') || (piece.color === 'b' && sq[1] === '1'))

                if (isPromotion) {
                    setPendingPromotion({ from: selectedSq, to: sq })
                    setSelectedSq(null)
                    setLegalDests([])
                    return
                }
                commitMove(selectedSq, sq, 'q')
                return
            }
            setSelectedSq(null)
            setLegalDests([])
        }

        const piece = chess.get(sq)
        const myColorCode: Color = myColor === 'white' ? 'w' : 'b'
        if (piece && piece.color === myColorCode) {
            setSelectedSq(sq)
            const moves = chess.moves({ square: sq, verbose: true })
            setLegalDests(moves.map(m => m.to as Square))
        }
    }, [selectedSq, legalDests, isMyTurn, commitMove, myColor])

    // ── History navigation ───────────────────────────────────────────────────
    const goToMove = (idx: number | null) => {
        setViewIndex(idx)
        setSelectedSq(null)
        setLegalDests([])
    }

    const sendChat = () => {
        if (!chatMsg.trim() || !myProfile || !socket) return
        socket.emit('send_message', { game_id: params.id, from: myProfile.username, text: chatMsg.trim() })
        // Don't add locally — server broadcasts back to entire room including sender
        setChatMsg('')
    }

    const handleResign = () => {
        if (!socket || !myProfile || gameOver) return
        const result = myColor === 'white' ? 'Black wins' : 'White wins'
        setGameOver({ result, reason: 'Resignation' })
        setResignConfirm(false)
        socket.emit('game_end', {
            game_id: params.id, result, reason: 'Resignation',
            white_id: gameData?.white_id, black_id: gameData?.black_id,
            is_rated: gameData?.is_rated ?? false,
            time_control: gameData?.time_control ?? '10',
        })
        if (soundOn) playGameEndSound(false)
    }

    // ── Board rendering ──────────────────────────────────────────────────────
    const boardArray = displayChess.board()
    const ranks = flipped ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0]
    const files = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7]

    const whitePlayer = gameData?.white
    const blackPlayer = gameData?.black
    const topPlayer = flipped ? whitePlayer : blackPlayer
    const bottomPlayer = flipped ? blackPlayer : whitePlayer
    const topTime = flipped ? whiteTime : blackTime
    const bottomTime = flipped ? blackTime : whiteTime
    const turnColor = chessRef.current.turn()
    const topIsActive = !gameOver && ((flipped && turnColor === 'w') || (!flipped && turnColor === 'b'))
    const bottomIsActive = !gameOver && !topIsActive
    const topRatingChange = flipped ? whiteRatingChange : blackRatingChange
    const bottomRatingChange = flipped ? blackRatingChange : whiteRatingChange
    const evalPct = 50

    // For board highlights, use live chess state for check (not displayChess)
    const liveChess = chessRef.current

    return (
        <>
        <div className="max-w-7xl mx-auto px-2 sm:px-4 py-4 flex flex-col lg:flex-row gap-4 min-h-[calc(100vh-60px)]">

            {/* Eval bar */}
            <div className="hidden lg:flex w-5 flex-col rounded-lg overflow-hidden relative" style={{ height: 'min(80vh, 800px)', background: 'var(--bg-elevated)', border: '0.5px solid var(--border)' }}>
                <div className="absolute top-1.5 w-full text-center z-10" style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>W</div>
                <div className="absolute bottom-1.5 w-full text-center z-10" style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>B</div>
                <div className="absolute top-0 w-full transition-all duration-500" style={{ height: `${100 - evalPct}%`, background: '#2C2C2C' }} />
                <div className="absolute bottom-0 w-full transition-all duration-500" style={{ height: `${evalPct}%`, background: '#E8DDD0' }} />
            </div>

            {/* Board column */}
            <div className="flex-1 max-w-[min(80vh,780px)] mx-auto flex flex-col w-full gap-0 relative">

                {!connected && (
                    <div className="w-full text-center text-xs bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 py-1.5 rounded-lg mb-1 flex items-center justify-center gap-2">
                        <div className="w-3 h-3 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                        Reconnecting…
                    </div>
                )}

                {!isLive && (
                    <div className="w-full text-center text-xs bg-accent/10 border border-accent/30 text-accent py-1.5 rounded-lg mb-1">
                        Viewing move {viewIndex! + 1} of {fenSnapshots.length} —{' '}
                        <button onClick={() => goToMove(null)} className="underline hover:text-accent-hover">Return to live</button>
                    </div>
                )}

                {opponentDisconnected && !gameOver && (
                    <div className="w-full text-center text-xs bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 py-1.5 rounded-lg mb-1 flex items-center justify-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                        Opponent disconnected — they have {disconnectCountdown}s to reconnect
                    </div>
                )}

                <PlayerStrip player={topPlayer} time={topTime} isActive={topIsActive} isBottom={false} ratingChange={topRatingChange} isMe={false} timeControl={gameData?.time_control} />

                {/* Board */}
                <div className="w-full aspect-square relative select-none" style={{ background: 'var(--frame-outer)', padding: '3px' }}>
                    <div className="w-full h-full grid grid-cols-8 grid-rows-8 relative overflow-hidden rounded-sm">
                        {ranks.map(rank =>
                            files.map(file => {
                                const sq = coordsToSq(file, rank)
                                const piece = boardArray[7 - rank][file]
                                const isLight = (file + rank) % 2 === 1
                                const isSelected = selectedSq === sq
                                const isLegal = legalDests.includes(sq)
                                const isLastFrom = lastMove?.from === sq
                                const isLastTo = lastMove?.to === sq
                                const isInCheck = isLive && liveChess.inCheck() && piece?.type === 'k' && piece.color === liveChess.turn()

                                let bg = isLight ? 'var(--board-light)' : 'var(--board-dark)'
                                if (isSelected) bg = 'rgba(250,250,100,0.55)'
                                else if (isLastFrom || isLastTo) bg = isLight ? 'rgba(196,150,90,0.5)' : 'rgba(196,150,90,0.4)'
                                if (isInCheck) bg = 'rgba(192,57,43,0.75)'

                                return (
                                    <div key={sq} onClick={() => handleSquareClick(sq)}
                                        className={`relative flex items-center justify-center transition-colors duration-100 ${isMyTurn() ? 'cursor-pointer hover:brightness-110' : 'cursor-default'}`}
                                        style={{ background: bg }}>
                                        {file === (flipped ? 7 : 0) && (
                                            <span className="absolute top-0.5 left-1 text-[10px] font-medium z-10 pointer-events-none"
                                                style={{ color: isLight ? 'var(--board-dark)' : 'var(--board-light)', opacity: 0.8 }}>
                                                {rank + 1}
                                            </span>
                                        )}
                                        {rank === (flipped ? 7 : 0) && (
                                            <span className="absolute bottom-0.5 right-1 text-[10px] font-medium z-10 pointer-events-none"
                                                style={{ color: isLight ? 'var(--board-dark)' : 'var(--board-light)', opacity: 0.8 }}>
                                                {String.fromCharCode(97 + file)}
                                            </span>
                                        )}
                                        {isLegal && !piece && <div className="w-[28%] h-[28%] rounded-full bg-black/20 pointer-events-none" />}
                                        {isLegal && piece && <div className="absolute inset-0 rounded-sm ring-[5px] ring-inset ring-black/25 pointer-events-none" />}
                                        {piece && <Piece color={piece.color} type={piece.type} />}
                                    </div>
                                )
                            })
                        )}
                    </div>

                    {/* Promotion modal */}
                    {pendingPromotion && (
                        <PromotionModal
                            color={myColor as 'white' | 'black'}
                            onSelect={p => commitMove(pendingPromotion.from, pendingPromotion.to, p)}
                        />
                    )}

                    {/* subtle game-over board tint */}
                    {gameOver && (
                        <div className="absolute inset-0 bg-black/15 z-10 pointer-events-none" />
                    )}
                </div>

                <PlayerStrip player={bottomPlayer} time={bottomTime} isActive={bottomIsActive} isBottom={true} ratingChange={bottomRatingChange} isMe={true} timeControl={gameData?.time_control} />

                {/* Action bar */}
                <div className="flex justify-center gap-2 mt-3">
                    <button onClick={() => setSoundOn(v => !v)} title="Toggle sound"
                        className="w-10 h-10 flex items-center justify-center rounded-lg border border-border hover:bg-surface text-text-secondary hover:text-text-primary transition-colors">
                        {soundOn ? <Volume2 size={17} strokeWidth={1.5} /> : <VolumeX size={17} strokeWidth={1.5} />}
                    </button>
                    <button onClick={() => setFlipped(v => !v)} title="Flip board"
                        className="w-10 h-10 flex items-center justify-center rounded-lg border border-border hover:bg-surface text-text-secondary hover:text-text-primary transition-colors">
                        <RotateCcw size={17} strokeWidth={1.5} />
                    </button>
                    {fenSnapshots.length > 0 && (
                        <button
                            onClick={() => goToMove(Math.max(0, (viewIndex ?? fenSnapshots.length) - 1))}
                            title="Step back one move"
                            className="w-10 h-10 flex items-center justify-center rounded-lg border border-border hover:bg-surface text-text-secondary hover:text-text-primary transition-colors">
                            <Undo2 size={17} strokeWidth={1.5} />
                        </button>
                    )}
                    {myColor !== 'spectator' && !gameOver && (
                        resignConfirm ? (
                            <div className="flex items-center gap-1 bg-red-500/10 border border-red-500/40 rounded-lg px-2 py-1">
                                <span className="text-red-400 text-xs font-medium">Resign?</span>
                                <button onClick={handleResign} title="Confirm resign"
                                    className="w-7 h-7 flex items-center justify-center rounded text-red-400 hover:bg-red-500/20 transition-colors">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6 9 17l-5-5"/></svg>
                                </button>
                                <button onClick={() => setResignConfirm(false)} title="Cancel"
                                    className="w-7 h-7 flex items-center justify-center rounded text-text-tertiary hover:bg-surface transition-colors">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
                                </button>
                            </div>
                        ) : (
                            <button onClick={() => setResignConfirm(true)} title="Resign"
                                className="w-10 h-10 flex items-center justify-center rounded-lg border border-border hover:bg-red-500/10 text-text-secondary hover:text-red-400 transition-colors">
                                <Flag size={17} strokeWidth={1.5} />
                            </button>
                        )
                    )}
                    {myColor === 'spectator' && (
                        <span className="flex items-center px-3 py-1.5 rounded-lg bg-surface border border-border text-text-tertiary text-xs">Spectating</span>
                    )}
                </div>

                {/* ── Game-over modal — centered over board column ── */}
                {gameOver && showGameOverModal && (
                    <div className="absolute inset-0 z-[200] flex items-center justify-center pointer-events-none">
                        <div className="pointer-events-auto relative bg-elevated border border-border rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.6)] w-full max-w-[320px] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                            {/* Header */}
                            <div className="relative px-6 pt-6 pb-4 text-center border-b border-border/60">
                                <button onClick={() => setShowGameOverModal(false)}
                                    className="absolute top-3.5 right-3.5 w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                                    style={{ background: 'var(--bg-hover)', color: 'var(--text-tertiary)' }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)'}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
                                </button>
                                {(() => {
                                    const isWin = myColor !== 'spectator' && gameOver.result.toLowerCase().startsWith(myColor);
                                    const isDraw = gameOver.result.toLowerCase().includes('draw');
                                    const isLoss = myColor !== 'spectator' && !isWin && !isDraw;
                                    return (
                                        <div className="flex flex-col items-center gap-2 mb-3">
                                            <div className="w-12 h-12 rounded-full flex items-center justify-center"
                                                style={{ background: isWin ? 'var(--accent-dim)' : isDraw ? 'var(--bg-surface)' : 'rgba(192,57,43,0.1)' }}>
                                                {isWin && <Crown size={24} className="text-accent" strokeWidth={1.5} />}
                                                {isDraw && <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5"><path d="M5 12h14"/><path d="M5 8h14"/><path d="M5 16h14"/></svg>}
                                                {isLoss && <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#E74C3C" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>}
                                                {myColor === 'spectator' && <Trophy size={24} className="text-accent" strokeWidth={1.5} />}
                                            </div>
                                            <div className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                                                {myColor !== 'spectator' ? (isWin ? 'You Win!' : isDraw ? 'Draw' : 'You Lost') : gameOver.result}
                                            </div>
                                        </div>
                                    );
                                })()}
                                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>by {gameOver.reason}</div>
                                {myColor !== 'spectator' && (() => {
                                    const change = myColor === 'white' ? whiteRatingChange : blackRatingChange
                                    if (change === null) return null
                                    const positive = change >= 0
                                    return (
                                        <div className={`mt-2 text-base font-semibold tabular-nums ${positive ? 'text-green-400' : 'text-red-400'}`}>
                                            Rating {positive ? '+' : ''}{change}
                                        </div>
                                    )
                                })()}
                            </div>

                            {/* Buttons */}
                            <div className="p-4 space-y-2.5">
                                <button
                                    onClick={() => { setShowGameOverModal(false); goToMove(0) }}
                                    className="w-full py-3 bg-accent hover:bg-accent-hover text-surface font-bold text-sm rounded-xl transition-colors flex items-center justify-center gap-2">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
                                    Game Review
                                </button>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => { setShowGameOverModal(false); router.push('/lobby') }}
                                        className="py-2.5 bg-surface hover:bg-hover border border-border text-text-primary font-medium text-sm rounded-xl transition-colors text-center">
                                        + New Game
                                    </button>
                                    {myColor !== 'spectator' ? (
                                        rematchState === 'sent' ? (
                                            <button disabled className="py-2.5 bg-surface border border-border text-text-tertiary font-medium text-sm rounded-xl flex items-center justify-center gap-1.5 cursor-default">
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin"><circle cx="12" cy="12" r="10"/></svg>
                                                Waiting…
                                            </button>
                                        ) : rematchState === 'declined' ? (
                                            <button disabled className="py-2.5 bg-surface border border-red-500/30 text-red-400 font-medium text-sm rounded-xl flex items-center justify-center cursor-default">
                                                Declined
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => {
                                                    const opponentId = myColor === 'white' ? gameData?.black_id : gameData?.white_id
                                                    socket?.emit('rematch_request', {
                                                        from_user_id: myProfile?.id,
                                                        to_user_id: opponentId,
                                                        from_username: myProfile?.display_name || myProfile?.username,
                                                        time_control: gameData?.time_control ?? '10',
                                                        is_rated: gameData?.is_rated ?? false,
                                                    })
                                                    setRematchState('sent')
                                                }}
                                                className="py-2.5 bg-surface hover:bg-hover border border-border text-text-primary font-medium text-sm rounded-xl transition-colors flex items-center justify-center gap-1.5">
                                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
                                                Rematch
                                            </button>
                                        )
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Right sidebar */}
            <div className="w-full lg:w-72 bg-surface border border-border rounded-xl flex flex-col overflow-hidden" style={{ height: 'min(80vh, 800px)' }}>
                <div className="flex border-b border-border shrink-0">
                    {(['Moves', 'Engine', 'Chat'] as const).map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)}
                            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${activeTab === tab ? 'text-accent border-b-2 border-accent' : 'text-text-secondary hover:text-text-primary'}`}>
                            {tab}
                        </button>
                    ))}
                </div>

                <div className="flex-1 overflow-hidden flex flex-col">
                    {activeTab === 'Moves' && (
                        <>
                            <div ref={moveListRef} className="flex-1 overflow-y-auto p-3">
                                <div className="space-y-0.5">
                                    {Array.from({ length: Math.ceil(moveList.length / 2) }).map((_, i) => {
                                        const wi = i * 2
                                        const bi = i * 2 + 1
                                        return (
                                            <div key={i} className="grid grid-cols-[28px_1fr_1fr] text-sm py-1 rounded hover:bg-elevated px-1">
                                                <span className="text-text-tertiary">{i + 1}.</span>
                                                <button
                                                    onClick={() => goToMove(wi)}
                                                    className={`text-left font-mono transition-colors px-1 rounded ${viewIndex === wi ? 'bg-accent/20 text-accent' : 'text-text-primary hover:text-accent'}`}>
                                                    {moveList[wi] ?? ''}
                                                </button>
                                                {moveList[bi] !== undefined && (
                                                    <button
                                                        onClick={() => goToMove(bi)}
                                                        className={`text-left font-mono transition-colors px-1 rounded ${viewIndex === bi ? 'bg-accent/20 text-accent' : 'text-text-primary hover:text-accent'}`}>
                                                        {moveList[bi]}
                                                    </button>
                                                )}
                                            </div>
                                        )
                                    })}
                                    {moveList.length === 0 && (
                                        <p className="text-text-tertiary text-sm text-center py-6">No moves yet</p>
                                    )}
                                </div>
                            </div>
                            {/* Navigation controls */}
                            <div className="border-t border-border p-2 flex items-center justify-center gap-1 shrink-0">
                                <button onClick={() => goToMove(0)} disabled={fenSnapshots.length === 0}
                                    className="p-2 rounded hover:bg-elevated text-text-secondary hover:text-text-primary disabled:opacity-30 transition-colors">
                                    <SkipBack size={15} strokeWidth={1.5} />
                                </button>
                                <button onClick={() => goToMove(Math.max(0, (viewIndex ?? fenSnapshots.length) - 1))} disabled={fenSnapshots.length === 0}
                                    className="p-2 rounded hover:bg-elevated text-text-secondary hover:text-text-primary disabled:opacity-30 transition-colors">
                                    <ChevronLeft size={15} strokeWidth={1.5} />
                                </button>
                                <button onClick={() => {
                                    const next = (viewIndex ?? -1) + 1
                                    if (next >= fenSnapshots.length) goToMove(null)
                                    else goToMove(next)
                                }} disabled={isLive && fenSnapshots.length === 0}
                                    className="p-2 rounded hover:bg-elevated text-text-secondary hover:text-text-primary disabled:opacity-30 transition-colors">
                                    <ChevronRight size={15} strokeWidth={1.5} />
                                </button>
                                <button onClick={() => goToMove(null)} disabled={isLive}
                                    className="p-2 rounded hover:bg-elevated text-text-secondary hover:text-text-primary disabled:opacity-30 transition-colors">
                                    <SkipForward size={15} strokeWidth={1.5} />
                                </button>
                            </div>

                            {/* Action buttons */}
                            <div className="border-t border-border px-3 py-2 flex items-center justify-center gap-2 shrink-0">
                                <button onClick={() => setSoundOn(v => !v)} title="Toggle sound"
                                    className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors"
                                    style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border-strong)', color: 'var(--text-secondary)' }}
                                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}>
                                    {soundOn ? <Volume2 size={16} strokeWidth={1.5} /> : <VolumeX size={16} strokeWidth={1.5} />}
                                </button>
                                <button onClick={() => setFlipped(v => !v)} title="Flip board"
                                    className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors"
                                    style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border-strong)', color: 'var(--text-secondary)' }}
                                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}>
                                    <RotateCcw size={16} strokeWidth={1.5} />
                                </button>
                                <button
                                    onClick={() => goToMove(Math.max(0, (viewIndex ?? fenSnapshots.length) - 1))}
                                    disabled={fenSnapshots.length === 0}
                                    title="Step back"
                                    className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors disabled:opacity-30"
                                    style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border-strong)', color: 'var(--text-secondary)' }}
                                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}>
                                    <Undo2 size={16} strokeWidth={1.5} />
                                </button>
                                {myColor !== 'spectator' && !gameOver && (
                                    resignConfirm ? (
                                        <div className="flex items-center gap-1 rounded-xl px-2 py-1" style={{ background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.4)' }}>
                                            <span className="text-red-400 text-xs font-medium">Resign?</span>
                                            <button onClick={handleResign}
                                                className="w-6 h-6 flex items-center justify-center rounded text-red-400 hover:bg-red-500/20 transition-colors">
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6 9 17l-5-5"/></svg>
                                            </button>
                                            <button onClick={() => setResignConfirm(false)}
                                                className="w-6 h-6 flex items-center justify-center rounded transition-colors" style={{ color: 'var(--text-tertiary)' }}>
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
                                            </button>
                                        </div>
                                    ) : (
                                        <button onClick={() => setResignConfirm(true)} title="Resign"
                                            className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors"
                                            style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border-strong)', color: 'var(--text-secondary)' }}
                                            onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)'; }}
                                            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-strong)'; }}>
                                            <Flag size={16} strokeWidth={1.5} />
                                        </button>
                                    )
                                )}
                            </div>
                        </>
                    )}

                    {activeTab === 'Engine' && (
                        <div className="p-4">
                            <div className="flex justify-between items-center mb-4">
                                <span className="text-text-primary font-medium text-sm">Stockfish 16.1</span>
                                <span className="text-xs bg-elevated px-2 py-1 rounded text-text-secondary border border-border">depth 22</span>
                            </div>
                            <p className="text-text-tertiary text-xs text-center py-6">Enable engine analysis after the game finishes.</p>
                        </div>
                    )}

                    {activeTab === 'Chat' && (
                        <div className="flex flex-col flex-1 overflow-hidden">
                            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                                {chatLog.map((msg, i) => (
                                    <div key={i} className={`text-sm ${msg.from === 'System' ? 'text-center text-text-tertiary text-xs py-1' : ''}`}>
                                        {msg.from !== 'System' && (
                                            <Link href={`/profile/${msg.from}`} className="text-text-tertiary text-xs hover:text-accent transition-colors">
                                                {msg.from}:{' '}
                                            </Link>
                                        )}
                                        <span className="text-text-primary">{msg.text}</span>
                                    </div>
                                ))}
                            </div>
                            {myColor !== 'spectator' && (
                                <div className="p-3 border-t border-border shrink-0">
                                    <div className="flex gap-1.5 mb-2 flex-wrap">
                                        {['Good luck!', 'GG', 'Thanks!', '?!'].map(t => (
                                            <button key={t} onClick={() => setChatMsg(t)}
                                                className="px-2 py-0.5 bg-elevated border border-border rounded text-xs text-text-secondary hover:text-text-primary hover:bg-hover transition-colors">
                                                {t}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex gap-2 w-full">
                                        <input value={chatMsg} onChange={e => setChatMsg(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && sendChat()}
                                            placeholder="Send message..."
                                            className="flex-1 bg-elevated border border-border-strong rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-accent min-w-0" />
                                        <button onClick={sendChat} className="shrink-0 p-2 bg-accent hover:bg-accent-hover text-surface rounded-lg transition-colors">
                                            <Send size={15} strokeWidth={1.5} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {!gameOver && (
                    <div className="p-3 border-t border-border shrink-0">
                        <div className={`text-xs text-center py-1.5 rounded-lg font-medium ${
                            turnColor === 'w' ? 'bg-white/10 text-white' : 'bg-black/20 text-text-secondary'
                        }`}>
                            {isMyTurn() ? 'Your turn' : `${turnColor === 'w' ? (whitePlayer?.display_name || whitePlayer?.username || 'White') : (blackPlayer?.display_name || blackPlayer?.username || 'Black')}'s turn`}
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* ── Rematch incoming — bottom-right toast ── */}
        {rematchState === 'received' && (
            <div className="fixed bottom-6 right-6 z-[300] w-72 animate-in slide-in-from-bottom-3 fade-in duration-200">
                <div className="rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.6)] p-5"
                    style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border-accent)' }}>
                    <div className="text-text-primary font-semibold text-sm mb-0.5">{rematchFromUser} wants a rematch</div>
                    <div className="text-text-tertiary text-xs mb-4">{gameData?.time_control ?? '10'} min · {gameData?.is_rated ? 'Rated' : 'Unrated'}</div>
                    <div className="flex gap-3">
                        <button onClick={() => {
                            socket?.emit('rematch_decline', { to_user_id: myColor === 'white' ? gameData?.white_id : gameData?.black_id, by_username: myProfile?.display_name || myProfile?.username })
                            setRematchState('idle')
                        }} className="flex-1 py-2.5 bg-surface hover:bg-hover border border-border rounded-xl text-text-secondary transition-colors flex items-center justify-center">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
                        </button>
                        <button onClick={() => {
                            const opponentId = myColor === 'white' ? gameData?.black_id : gameData?.white_id
                            socket?.emit('rematch_accept', {
                                from_user_id: opponentId,
                                to_user_id: myProfile?.id,
                                time_control: gameData?.time_control ?? '10',
                                is_rated: gameData?.is_rated ?? false,
                            })
                            setRematchState('idle')
                        }} className="flex-1 py-2.5 bg-accent hover:bg-accent-hover rounded-xl text-surface transition-colors flex items-center justify-center">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6 9 17l-5-5"/></svg>
                        </button>
                    </div>
                </div>
            </div>
        )}

        </>
    )
}
