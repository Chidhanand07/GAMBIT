"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from 'next/link';
import { Chess } from 'chess.js';
import { ChevronLeft, ChevronRight, SkipBack, SkipForward } from 'lucide-react';
import Piece from '@/components/ui/Piece';

// chess.com-style classification metadata: badge symbol + colour.
const CLASS_META: Record<string, { sym: string; color: string; label: string }> = {
    Brilliant:    { sym: '!!', color: '#26C2A3', label: 'Brilliant' },
    'Great move': { sym: '!',  color: '#5B8BB0', label: 'Great' },
    Best:         { sym: '★',  color: '#749B4F', label: 'Best' },
    Excellent:    { sym: '✓',  color: '#81B64C', label: 'Excellent' },
    Good:         { sym: '·',  color: '#A0A0A0', label: 'Good' },
    Book:         { sym: '❉',  color: '#A88865', label: 'Book' },
    Inaccuracy:   { sym: '?!', color: '#F0C15C', label: 'Inaccuracy' },
    Mistake:      { sym: '?',  color: '#E58F2A', label: 'Mistake' },
    Miss:         { sym: '×',  color: '#D96BA0', label: 'Miss' },
    Blunder:      { sym: '??', color: '#CA3431', label: 'Blunder' },
};
const CLASS_ORDER = ['Brilliant', 'Great move', 'Best', 'Excellent', 'Good', 'Book', 'Inaccuracy', 'Mistake', 'Miss', 'Blunder'];

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

type MoveEntry = {
    ply: number; move: string; san: string; classification: string;
    accuracy: number; best_move: string; eval_white: number;
};

// A crude "performance rating" from accuracy, so the review feels chess.com-like.
function estRating(acc: number | null) {
    if (acc == null) return null;
    return Math.max(200, Math.min(2900, Math.round(acc * 27)));
}

export default function GameResultPage({ params }: { params: { id: string } }) {
    const [game, setGame] = useState<any>(null);
    const [status, setStatus] = useState<'loading' | 'analyzing' | 'ready' | 'error'>('loading');
    const [ply, setPly] = useState(0);
    const [flipped, setFlipped] = useState(false);

    // Fetch the game row; poll while analysis is still running.
    const load = useCallback(async () => {
        try {
            const res = await fetch(`/api/games/${params.id}`);
            if (!res.ok) { setStatus('error'); return; }
            const g = await res.json();
            setGame(g);
            const hasAnalysis = (g.white_move_classifications?.length || g.black_move_classifications?.length);
            setStatus(hasAnalysis ? 'ready' : 'analyzing');
            if (g.black_id === g.black?.id && g.myColor === 'black') setFlipped(true);
            return !!hasAnalysis;
        } catch { setStatus('error'); return false; }
    }, [params.id]);

    useEffect(() => {
        let tries = 0;
        let timer: any;
        const tick = async () => {
            const done = await load();
            tries++;
            if (!done && tries < 20) timer = setTimeout(tick, 3000); // poll up to ~60s
        };
        tick();
        return () => clearTimeout(timer);
    }, [load]);

    // Merge both sides' per-move classifications into one ply-ordered list.
    const moves: MoveEntry[] = useMemo(() => {
        if (!game) return [];
        const all = [...(game.white_move_classifications || []), ...(game.black_move_classifications || [])];
        return all.filter((m: any) => typeof m.ply === 'number').sort((a: any, b: any) => a.ply - b.ply);
    }, [game]);

    // Reconstruct a board position for every ply by replaying the moves.
    const positions: string[] = useMemo(() => {
        const c = new Chess();
        const fens = [c.fen()];
        for (const m of moves) {
            try { c.move({ from: m.move.slice(0, 2), to: m.move.slice(2, 4), promotion: (m.move.slice(4) || 'q') as any }); }
            catch { break; }
            fens.push(c.fen());
        }
        return fens;
    }, [moves]);

    const counts = useMemo(() => {
        const tally = (arr: any[]) => {
            const c: Record<string, number> = {};
            for (const m of (arr || [])) c[m.classification] = (c[m.classification] || 0) + 1;
            return c;
        };
        return { white: tally(game?.white_move_classifications), black: tally(game?.black_move_classifications) };
    }, [game]);

    if (status === 'loading') return <Centered><Spinner /><p className="text-text-secondary">Loading game…</p></Centered>;
    if (status === 'error') return <Centered><p className="text-text-secondary">Couldn&apos;t load this game.</p><Link href="/lobby" className="text-accent">Back to lobby</Link></Centered>;
    if (status === 'analyzing') return (
        <Centered>
            <Spinner />
            <h2 className="text-xl text-text-primary">Analysing your game…</h2>
            <p className="text-text-secondary text-sm">Stockfish depth 18 is reviewing every move.</p>
        </Centered>
    );

    const curFen = positions[Math.min(ply, positions.length - 1)] || new Chess().fen();
    const curMove = ply > 0 ? moves[ply - 1] : null;
    const orderedRanks = flipped ? [...RANKS].reverse() : RANKS;
    const orderedFiles = flipped ? [...FILES].reverse() : FILES;
    const chess = new Chess(curFen);

    const lastFrom = curMove?.move.slice(0, 2);
    const lastTo = curMove?.move.slice(2, 4);
    const bestFrom = curMove?.best_move?.slice(0, 2);
    const bestTo = curMove?.best_move?.slice(2, 4);

    const wName = game.white?.display_name || game.white?.username || 'White';
    const bName = game.black?.display_name || game.black?.username || 'Black';

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            <h1 className="text-2xl font-semibold text-text-primary mb-6">Game Review</h1>
            <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr_300px] gap-6">
                <PlayerCard name={wName} color="White" accuracy={game.white_accuracy} rating={game.white?.rating_rapid} counts={counts.white} />

                {/* Center: board + eval graph + controls */}
                <div className="flex flex-col items-center">
                    <div className="w-full max-w-[480px]">
                        <div className="w-full relative border-[10px] border-[#2E2B25] rounded-sm shadow-[-8px_8px_24px_rgba(0,0,0,0.5)]">
                            <div className="grid grid-cols-8 grid-rows-8 w-full aspect-square">
                                {orderedRanks.map(r => orderedFiles.map(f => {
                                    const sq = f + r;
                                    const piece = chess.get(sq as any);
                                    const isLight = (FILES.indexOf(f) + RANKS.indexOf(r)) % 2 === 0;
                                    const isLast = sq === lastFrom || sq === lastTo;
                                    const isBest = sq === bestFrom || sq === bestTo;
                                    return (
                                        <div key={sq} className={`relative w-full aspect-square flex items-center justify-center ${isLight ? 'bg-board-light' : 'bg-board-dark'}`}>
                                            {isLast && <div className="absolute inset-0 bg-yellow-400/35" />}
                                            {isBest && !isLast && <div className="absolute inset-0 ring-4 ring-inset ring-[#749B4F]/70" />}
                                            {piece && <div className="w-full h-full flex items-center justify-center z-10"><Piece color={piece.color} type={piece.type} /></div>}
                                        </div>
                                    );
                                }))}
                            </div>
                            {/* classification badge for current move */}
                            {curMove && CLASS_META[curMove.classification] && (
                                <div className="absolute -top-3 -right-3 w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-lg z-20"
                                    style={{ background: CLASS_META[curMove.classification].color }}>
                                    {CLASS_META[curMove.classification].sym}
                                </div>
                            )}
                        </div>

                        {/* Eval graph */}
                        <EvalGraph moves={moves} ply={ply} onSeek={setPly} />

                        {/* Move caption */}
                        <div className="mt-3 h-6 text-center text-sm">
                            {curMove ? (
                                <span style={{ color: CLASS_META[curMove.classification]?.color }}>
                                    {curMove.san} — {CLASS_META[curMove.classification]?.label || curMove.classification}
                                    {curMove.best_move && curMove.classification !== 'Best' && curMove.classification !== 'Book' && (
                                        <span className="text-text-tertiary"> · best was {uciToPretty(positions[ply - 1], curMove.best_move)}</span>
                                    )}
                                </span>
                            ) : <span className="text-text-tertiary">Starting position</span>}
                        </div>

                        {/* Controls */}
                        <div className="flex items-center justify-center gap-2 mt-3">
                            <Ctrl onClick={() => setPly(0)}><SkipBack size={16} /></Ctrl>
                            <Ctrl onClick={() => setPly(p => Math.max(0, p - 1))}><ChevronLeft size={16} /></Ctrl>
                            <span className="text-sm text-text-secondary tabular-nums w-24 text-center">{ply} / {moves.length}</span>
                            <Ctrl onClick={() => setPly(p => Math.min(moves.length, p + 1))}><ChevronRight size={16} /></Ctrl>
                            <Ctrl onClick={() => setPly(moves.length)}><SkipForward size={16} /></Ctrl>
                            <Ctrl onClick={() => setFlipped(f => !f)}>⟲</Ctrl>
                        </div>
                    </div>
                </div>

                <PlayerCard name={bName} color="Black" accuracy={game.black_accuracy} rating={game.black?.rating_rapid} counts={counts.black} />
            </div>

            {/* Move list */}
            <div className="mt-8 max-w-2xl mx-auto bg-surface border border-border rounded-xl p-4">
                <div className="grid grid-cols-2 gap-x-8 gap-y-1">
                    {Array.from({ length: Math.ceil(moves.length / 2) }).map((_, i) => {
                        const w = moves[i * 2], b = moves[i * 2 + 1];
                        return (
                            <div key={i} className="flex items-center gap-2 text-sm font-mono">
                                <span className="w-6 text-text-tertiary text-right">{i + 1}.</span>
                                {w && <MovePill m={w} active={ply === i * 2 + 1} onClick={() => setPly(i * 2 + 1)} />}
                                {b && <MovePill m={b} active={ply === i * 2 + 2} onClick={() => setPly(i * 2 + 2)} />}
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="mt-6 text-center">
                <Link href="/lobby" className="text-accent hover:underline">Back to lobby</Link>
            </div>
        </div>
    );
}

function MovePill({ m, active, onClick }: { m: MoveEntry; active: boolean; onClick: () => void }) {
    const meta = CLASS_META[m.classification];
    return (
        <button onClick={onClick} className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${active ? 'bg-hover' : 'hover:bg-hover/50'}`}>
            <span className="text-text-primary w-14 text-left">{m.san}</span>
            {meta && <span className="text-xs font-bold" style={{ color: meta.color }}>{meta.sym}</span>}
        </button>
    );
}

function PlayerCard({ name, color, accuracy, rating, counts }: any) {
    const acc = typeof accuracy === 'number' ? accuracy : null;
    return (
        <div className="bg-surface border border-border rounded-xl p-5 h-fit">
            <div className="flex items-center gap-2 mb-4">
                <span className="text-2xl" style={{ color: color === 'White' ? '#fff' : '#111', WebkitTextStroke: color === 'White' ? '1px #000' : undefined }}>{color === 'White' ? '♔' : '♚'}</span>
                <div>
                    <div className="font-medium text-text-primary">{name}</div>
                    <div className="text-xs text-text-tertiary">{color}{rating ? ` · ${Math.round(rating)}` : ''}</div>
                </div>
            </div>
            <div className="text-center mb-4">
                <div className="text-4xl font-bold text-accent tabular-nums">{acc != null ? acc.toFixed(1) : '—'}<span className="text-lg">%</span></div>
                <div className="text-xs text-text-tertiary uppercase tracking-wide mt-1">Accuracy</div>
                {estRating(acc) != null && <div className="text-xs text-text-secondary mt-1">Est. performance ~{estRating(acc)}</div>}
            </div>
            <div className="space-y-1.5">
                {CLASS_ORDER.filter(c => counts[c]).map(c => (
                    <div key={c} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: CLASS_META[c].color }}>{CLASS_META[c].sym}</span>
                            <span className="text-text-secondary">{CLASS_META[c].label}</span>
                        </span>
                        <span className="text-text-primary tabular-nums">{counts[c]}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function EvalGraph({ moves, ply, onSeek }: { moves: MoveEntry[]; ply: number; onSeek: (p: number) => void }) {
    if (!moves.length) return null;
    const W = 480, H = 64, mid = H / 2;
    const clamp = (cp: number) => Math.max(-800, Math.min(800, cp));
    const pts = moves.map((m, i) => {
        const x = (i / Math.max(1, moves.length - 1)) * W;
        const y = mid - (clamp(m.eval_white) / 800) * mid;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const cursorX = ((Math.max(1, ply) - 1) / Math.max(1, moves.length - 1)) * W;
    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-3 rounded bg-elevated cursor-pointer"
            onClick={(e) => {
                const rect = (e.target as SVGElement).closest('svg')!.getBoundingClientRect();
                const frac = (e.clientX - rect.left) / rect.width;
                onSeek(Math.round(frac * moves.length));
            }}>
            <rect x="0" y="0" width={W} height={mid} fill="#ffffff08" />
            <line x1="0" y1={mid} x2={W} y2={mid} stroke="#ffffff22" strokeWidth="1" />
            <polyline points={pts.join(' ')} fill="none" stroke="var(--accent)" strokeWidth="1.5" />
            {ply > 0 && <line x1={cursorX} y1="0" x2={cursorX} y2={H} stroke="var(--accent)" strokeWidth="1" opacity="0.6" />}
        </svg>
    );
}

function uciToPretty(fen: string | undefined, uci: string) {
    if (!fen) return uci;
    try {
        const c = new Chess(fen);
        const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: (uci.slice(4) || 'q') as any });
        return m?.san || uci;
    } catch { return uci; }
}

const Ctrl = ({ children, onClick }: any) => (
    <button onClick={onClick} className="w-9 h-9 flex items-center justify-center rounded-lg bg-surface border border-border-strong text-text-secondary hover:text-text-primary hover:bg-hover transition-colors">{children}</button>
);
const Centered = ({ children }: any) => <div className="flex flex-col items-center justify-center min-h-[70vh] gap-4">{children}</div>;
const Spinner = () => <div className="w-12 h-12 border-4 border-border border-t-accent rounded-full animate-spin" />;
