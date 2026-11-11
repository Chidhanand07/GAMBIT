"use client";

import dynamic from 'next/dynamic';
import { AnimatedBoard } from '@/features/landing/components/AnimatedBoard';
import { FeaturesSection, HeroCtas, HeroStats, LandingFooter } from '@/features/landing/components/LandingSections';

const KnightBackground = dynamic(() => import('@/components/ui/KnightBackground'), { ssr: false });

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
          <HeroCtas />

          {/* Stats bar */}
          <HeroStats />
        </div>

        {/* Right: animated board */}
        <div className="shrink-0 w-full max-w-[380px]">
          <AnimatedBoard />
        </div>
      </section>

      {/* ── FEATURES ── */}
      <FeaturesSection />

      {/* ── FOOTER ── */}
      <LandingFooter />
    </div>
    </>
  );
}
