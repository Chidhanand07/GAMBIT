"use client";

import { useEffect, useRef, useState } from 'react';
import { PHASE, initParticles, type Point } from '@/features/knight/introParticles';
import { sampleKnightPerimeter } from '@/features/knight/introSampling';
import { clearToBackground, drawPhase1to4, drawPhase5to7, type IntroScene } from '@/features/knight/introDraw';
import { applyIntroFade } from '@/features/knight/introFade';
import { IntroOverlay } from '@/features/knight/components/IntroOverlay';

export { sampleKnightPoints, sampleKnightPerimeter } from '@/features/knight/introSampling';

const PERIMETER_POINTS = 600;
const MS_PER_SECOND = 1000;
const MIN_CORES = 4;

/** Skip intro on reduced motion preference or low-perf devices. */
function shouldSkipIntro() {
  const prefersReduced =
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  const isLowPerf =
    typeof navigator !== 'undefined'
      ? (navigator.hardwareConcurrency ?? MIN_CORES) < MIN_CORES
      : false;
  return { prefersReduced, isLowPerf };
}

function fitCanvas(canvas: HTMLCanvasElement, dpr: number) {
  canvas.width  = window.innerWidth  * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width  = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
}

export default function KnightIntro({ onComplete }: { onComplete: () => void }) {
  const { prefersReduced, isLowPerf } = shouldSkipIntro();

  useEffect(() => {
    if (prefersReduced || isLowPerf) {
      onComplete();
    }
  }, [prefersReduced, isLowPerf, onComplete]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<(IntroScene & { rafId: number; startTime: number }) | null>(null);
  const perimeterRef = useRef<Point[]>([]);
  const [overlayAlpha, setOverlayAlpha] = useState(0);
  const [introOpacity, setIntroOpacity] = useState(1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    let mounted = true;

    const resize = () => fitCanvas(canvas, dpr);
    resize();
    window.addEventListener('resize', resize);

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    const cw = window.innerWidth, ch = window.innerHeight;
    const { formation, ambient, orbitals } = initParticles(cw, ch);
    perimeterRef.current = sampleKnightPerimeter(PERIMETER_POINTS, cw, ch);
    stateRef.current = {
      cw, ch, formation, ambient, orbitals,
      rafId: 0,
      startTime: performance.now(),
    };

    const loop = () => {
      if (!mounted || !stateRef.current) return;
      const t = (performance.now() - stateRef.current.startTime) / MS_PER_SECOND;

      if (t < PHASE.SOLIDIFY_END) {
        drawPhase1to4(ctx, stateRef.current, t);
      } else if (t < PHASE.SETTLE_END) {
        clearToBackground(ctx, cw, ch);
        drawPhase5to7(ctx, stateRef.current, t, perimeterRef.current);
      }

      applyIntroFade(t, setOverlayAlpha, setIntroOpacity);

      if (t >= PHASE.SETTLE_END) {
        if (mounted) onComplete();
        return;
      }

      stateRef.current.rafId = requestAnimationFrame(loop);
    };

    stateRef.current.rafId = requestAnimationFrame(loop);

    return () => {
      mounted = false;
      window.removeEventListener('resize', resize);
      if (stateRef.current) cancelAnimationFrame(stateRef.current.rafId);
    };
  }, [onComplete]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, opacity: introOpacity }}>
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
      <IntroOverlay overlayAlpha={overlayAlpha} onSkip={onComplete} />
    </div>
  );
}
