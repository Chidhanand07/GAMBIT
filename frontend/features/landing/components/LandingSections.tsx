import Link from 'next/link';
import type { MouseEvent } from 'react';
import { ChevronRight, Zap, BarChart2, Trophy, Users, Shield, Globe2 } from 'lucide-react';

// ── Features ──────────────────────────────────────────────────────────────────
const FEATURES = [
    {
        Icon: Zap,
        title: 'Bullet Games',
        desc: 'Sub-second reactions. Pure instinct. 1+0 bullet with server-authoritative clocks.',
    },
    {
        Icon: BarChart2,
        title: 'Accuracy Rating',
        desc: 'Depth-18 Stockfish centipawn loss classification after every game you play.',
    },
    {
        Icon: Users,
        title: 'Play Friends',
        desc: 'Invite links and private rooms. Share a link, start playing in seconds.',
    },
    {
        Icon: Trophy,
        title: 'Leaderboards',
        desc: 'Glicko-2 rated per time control. Bullet, blitz, rapid, and classical tracked separately.',
    },
    {
        Icon: Shield,
        title: 'Full Rules',
        desc: 'Castling, en passant, promotion. All edge cases handled by server-side chess.js.',
    },
    {
        Icon: Globe2,
        title: 'Play Anywhere',
        desc: 'Fully responsive down to 375px. Tap to select, tap to move on any device.',
    },
];

const HERO_STATS = [
    { num: '∞', label: 'games available' },
    { num: '6', label: 'time controls' },
    { num: 'Free', label: 'always' },
];

const FOOTER_LINKS = [
    ['Play', '/lobby'],
    ['Leaderboard', '/leaderboard'],
    ['Analysis', '/analysis'],
    ['Offline', '/offline'],
];

function liftCard(e: MouseEvent<HTMLDivElement>) {
    const el = e.currentTarget as HTMLDivElement;
    el.style.borderColor = 'var(--border-accent)';
    el.style.transform = 'translateY(-2px)';
    el.style.boxShadow = '0 4px 20px var(--accent-glow)';
}

function dropCard(e: MouseEvent<HTMLDivElement>) {
    const el = e.currentTarget as HTMLDivElement;
    el.style.borderColor = 'var(--border)';
    el.style.transform = '';
    el.style.boxShadow = '';
}

/** "Play Now" and "Create Account" buttons with their inline hover styles. */
export function HeroCtas() {
    return (
        <div className="flex items-center gap-3 justify-center lg:justify-start flex-wrap mb-8">
            <Link
                href="/lobby"
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-base btn-press transition-all shadow-lg"
                style={{ background: 'var(--accent)', color: '#0F0D0B', boxShadow: '0 4px 20px rgba(196,150,90,0.3)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent)')}
            >
                Play Now <ChevronRight size={18} strokeWidth={2} />
            </Link>
            <Link
                href="/signup"
                className="px-6 py-3 rounded-xl font-medium text-base btn-press transition-colors"
                style={{
                    background: 'var(--bg-elevated)',
                    border: '0.5px solid var(--border-strong)',
                    color: 'var(--text-primary)',
                }}
                onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-accent)';
                    (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
                }}
                onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)';
                    (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)';
                }}
            >
                Create Account
            </Link>
        </div>
    );
}

export function HeroStats() {
    return (
        <div
            className="flex items-center gap-6 justify-center lg:justify-start text-xs flex-wrap"
            style={{ color: 'var(--text-tertiary)' }}
        >
            {HERO_STATS.map((s) => (
                <div key={s.label} className="flex items-center gap-1.5">
                    <span className="font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>
                        {s.num}
                    </span>
                    <span>{s.label}</span>
                </div>
            ))}
        </div>
    );
}

export function FeaturesSection() {
    return (
        <section className="max-w-5xl mx-auto px-6 py-12 w-full">
            <p
                className="text-center text-xs uppercase mb-8 font-medium"
                style={{ color: 'var(--text-tertiary)', letterSpacing: '0.15em' }}
            >
                Why Gambit
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {FEATURES.map((f) => (
                    <div
                        key={f.title}
                        className="group rounded-xl p-6 cursor-default transition-all duration-200"
                        style={{ background: 'var(--bg-surface)', border: '0.5px solid var(--border)' }}
                        onMouseEnter={liftCard}
                        onMouseLeave={dropCard}
                    >
                        <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                            style={{ background: 'var(--accent-dim)' }}
                        >
                            <f.Icon size={20} className="text-accent" strokeWidth={1.5} />
                        </div>
                        <h3 className="font-medium text-sm mb-2" style={{ color: 'var(--text-primary)' }}>
                            {f.title}
                        </h3>
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                            {f.desc}
                        </p>
                    </div>
                ))}
            </div>
        </section>
    );
}

export function LandingFooter() {
    return (
        <footer
            className="mt-auto"
            style={{ background: 'var(--bg-elevated)', borderTop: '0.5px solid var(--border)' }}
        >
            <div className="max-w-5xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <span
                        className="text-accent font-serif select-none pb-0.5"
                        style={{ fontSize: '20px', lineHeight: 1 }}
                    >
                        ♘
                    </span>
                    <span className="font-semibold text-sm text-accent">Gambit</span>
                    <span className="text-xs ml-1" style={{ color: 'var(--text-tertiary)' }}>
                        · Chess, perfected.
                    </span>
                </div>
                <div className="flex gap-5 text-sm" style={{ color: 'var(--text-tertiary)' }}>
                    {FOOTER_LINKS.map(([l, h]) => (
                        <Link key={h} href={h} className="transition-colors hover:text-text-secondary">
                            {l}
                        </Link>
                    ))}
                </div>
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    © 2026 Gambit
                </span>
            </div>
        </footer>
    );
}
