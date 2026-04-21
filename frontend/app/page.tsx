"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronRight, Zap, BarChart2, Trophy, Users, Shield, Globe2 } from "lucide-react";
import { Chess } from "chess.js";
import dynamic from 'next/dynamic';

const KnightBackground = dynamic(() => import('@/components/ui/KnightBackground'), { ssr: false });

// ── Animated demo board ───────────────────────────────────────────────────────
const DEMO_MOVES = ['e2e4','e7e5','f2f4','e5f4','g1f3','g7g5','h2h4','g5g4'];
const GLYPHS: Record<string, string> = {
  wK:'♔',wQ:'♕',wR:'♖',wB:'♗',wN:'♘',wP:'♙',
  bK:'♚',bQ:'♛',bR:'♜',bB:'♝',bN:'♞',bP:'♟',
};

function AnimatedBoard() {
  const [fen, setFen] = useState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  const [lastMove, setLastMove] = useState<{from:string;to:string}|null>(null);

  useEffect(() => {
    const g = new Chess();
    let idx = 0;
    const tick = () => {
      if (idx < DEMO_MOVES.length) {
        const uci = DEMO_MOVES[idx];
        const from = uci.slice(0,2), to = uci.slice(2,4);
        g.move({ from, to });
        setFen(g.fen());
        setLastMove({ from, to });
        idx++;
      } else {
        setTimeout(() => {
          g.reset();
          setFen(g.fen());
          setLastMove(null);
          idx = 0;
        }, 3000);
      }
    };
    const timer = setInterval(tick, 900);
    return () => clearInterval(timer);
  }, []);

  const board = new Chess();
  try { board.load(fen); } catch {}
  const squares = board.board();
  const files = [0,1,2,3,4,5,6,7];
  const ranks = [7,6,5,4,3,2,1,0];

  return (
    <div className="relative w-full max-w-[360px] mx-auto">
      <div className="board-outer-frame p-[3px]">
        <div className="board-inner-frame w-full aspect-square grid grid-cols-8 grid-rows-8">
          {ranks.map(rank => files.map(file => {
            const sq = `${String.fromCharCode(97+file)}${rank+1}`;
            const piece = squares[7-rank][file];
            const isLight = (file+rank)%2===1;
            const isLast = lastMove?.from===sq||lastMove?.to===sq;
            let bg = isLight ? '#F0D9B5' : '#B58863';
            if (isLast) bg = isLight ? 'rgba(196,150,90,0.6)' : 'rgba(196,150,90,0.45)';
            return (
              <div key={sq} style={{ background: bg }} className="relative flex items-center justify-center">
                {piece && (
                  <span className="select-none" style={{
                    fontSize:'clamp(14px,4.5vw,38px)', lineHeight:1, fontFamily:'serif',
                    color: piece.color==='w' ? '#FFFFFF' : '#1A1A1A',
                    textShadow: piece.color==='w'
                      ? '0 1px 3px rgba(0,0,0,0.7),0 0 1px rgba(0,0,0,0.5)'
                      : '0 1px 0 rgba(255,255,255,0.2)',
                    filter: piece.color==='w'
                      ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))'
                      : 'drop-shadow(0 1px 1px rgba(0,0,0,0.4))',
                  }}>
                    {GLYPHS[`${piece.color}${piece.type.toUpperCase()}`]}
                  </span>
                )}
              </div>
            );
          }))}
        </div>
      </div>
      <p className="text-center text-xs mt-3 tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
        King&apos;s Gambit · 1. e4 e5 2. f4 exf4 3. Nf3 g5 4. h4
      </p>
    </div>
  );
}

// ── Features ──────────────────────────────────────────────────────────────────
const FEATURES = [
  { Icon: Zap,       title: 'Bullet Games',     desc: 'Sub-second reactions. Pure instinct. 1+0 bullet with server-authoritative clocks.' },
  { Icon: BarChart2, title: 'Accuracy Rating',  desc: 'Depth-18 Stockfish centipawn loss classification after every game you play.' },
  { Icon: Users,     title: 'Play Friends',      desc: 'Invite links and private rooms. Share a link, start playing in seconds.' },
  { Icon: Trophy,    title: 'Leaderboards',      desc: 'Glicko-2 rated per time control. Bullet, blitz, rapid, and classical tracked separately.' },
  { Icon: Shield,    title: 'Full Rules',        desc: 'Castling, en passant, promotion. All edge cases handled by server-side chess.js.' },
  { Icon: Globe2,    title: 'Play Anywhere',     desc: 'Fully responsive down to 375px. Tap to select, tap to move on any device.' },
];

export default function Home() {
  return (
    <>
      <KnightBackground mode="landing" />
      <div className="flex flex-col min-h-[calc(100vh-53px)] page-enter">

      {/* ── HERO ── */}
      <section className="flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-20 px-6 pt-16 pb-12 max-w-6xl mx-auto w-full">

        {/* Left: text */}
        <div className="flex-1 text-center lg:text-left max-w-xl">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs mb-8"
            style={{ background: 'var(--bg-elevated)', border: '0.5px solid var(--border-strong)', color: 'var(--text-secondary)' }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--accent)' }} />
            Free to play
          </div>

          {/* Headline */}
          <h1 className="mb-5 font-semibold"
            style={{
              fontSize:'clamp(44px,7vw,76px)', letterSpacing:'-3px', lineHeight:'1.0',
              background:'linear-gradient(135deg, var(--text-primary) 55%, var(--accent))',
              WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text',
            }}>
            Chess,<br />perfected.
          </h1>

          <p className="text-lg leading-relaxed mb-8 max-w-md mx-auto lg:mx-0" style={{ color: 'var(--text-secondary)' }}>
            A premium dark-mode chess platform with real-time matchmaking, engine analysis, and accuracy ratings.
          </p>

          {/* CTAs */}
          <div className="flex items-center gap-3 justify-center lg:justify-start flex-wrap mb-8">
            <Link href="/lobby"
              className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-base btn-press transition-all shadow-lg"
              style={{ background:'var(--accent)', color:'#0F0D0B', boxShadow:'0 4px 20px rgba(196,150,90,0.3)' }}
              onMouseEnter={e=>(e.currentTarget.style.background='var(--accent-hover)')}
              onMouseLeave={e=>(e.currentTarget.style.background='var(--accent)')}>
              Play Now <ChevronRight size={18} strokeWidth={2} />
            </Link>
            <Link href="/signup"
              className="px-6 py-3 rounded-xl font-medium text-base btn-press transition-colors"
              style={{ background:'var(--bg-elevated)', border:'0.5px solid var(--border-strong)', color:'var(--text-primary)' }}
              onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor='var(--border-accent)';(e.currentTarget as HTMLElement).style.background='var(--bg-hover)'}}
              onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor='var(--border-strong)';(e.currentTarget as HTMLElement).style.background='var(--bg-elevated)'}}>
              Create Account
            </Link>
          </div>

          {/* Stats bar */}
          <div className="flex items-center gap-6 justify-center lg:justify-start text-xs flex-wrap" style={{ color: 'var(--text-tertiary)' }}>
            {[
              { num: '∞', label: 'games available' },
              { num: '6', label: 'time controls' },
              { num: 'Free', label: 'always' },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-1.5">
                <span className="font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>{s.num}</span>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: animated board */}
        <div className="shrink-0 w-full max-w-[380px]">
          <AnimatedBoard />
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="max-w-5xl mx-auto px-6 py-12 w-full">
        <p className="text-center text-xs uppercase mb-8 font-medium" style={{ color: 'var(--text-tertiary)', letterSpacing: '0.15em' }}>
          Why Gambit
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {FEATURES.map(f => (
            <div key={f.title}
              className="group rounded-xl p-6 cursor-default transition-all duration-200"
              style={{ background:'var(--bg-surface)', border:'0.5px solid var(--border)' }}
              onMouseEnter={e=>{const el=e.currentTarget as HTMLDivElement;el.style.borderColor='var(--border-accent)';el.style.transform='translateY(-2px)';el.style.boxShadow='0 4px 20px var(--accent-glow)'}}
              onMouseLeave={e=>{const el=e.currentTarget as HTMLDivElement;el.style.borderColor='var(--border)';el.style.transform='';el.style.boxShadow=''}}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ background:'var(--accent-dim)' }}>
                <f.Icon size={20} className="text-accent" strokeWidth={1.5} />
              </div>
              <h3 className="font-medium text-sm mb-2" style={{ color: 'var(--text-primary)' }}>{f.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="mt-auto" style={{ background:'var(--bg-elevated)', borderTop:'0.5px solid var(--border)' }}>
        <div className="max-w-5xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-accent font-serif select-none pb-0.5" style={{ fontSize: '20px', lineHeight: 1 }}>♘</span>
            <span className="font-semibold text-sm text-accent">Gambit</span>
            <span className="text-xs ml-1" style={{ color: 'var(--text-tertiary)' }}>· Chess, perfected.</span>
          </div>
          <div className="flex gap-5 text-sm" style={{ color: 'var(--text-tertiary)' }}>
            {[['Play','/lobby'],['Leaderboard','/leaderboard'],['Analysis','/analysis'],['Offline','/offline']].map(([l,h])=>(
              <Link key={h} href={h} className="transition-colors hover:text-text-secondary">{l}</Link>
            ))}
          </div>
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>© 2026 Gambit</span>
        </div>
      </footer>
    </div>
    </>
  );
}
