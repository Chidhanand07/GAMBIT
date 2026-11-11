"use client";

import { useEffect, useRef } from 'react';
import { drawLandingFrame, drawLobbyFrame, makeFloaters } from '@/features/knight/backgroundDraw';

interface Props {
  mode: 'landing' | 'lobby';
}

/** Parallax angle advance per second. */
const ANGLE_SPEED = 0.3;
const MS_PER_SECOND = 1000;

export default function KnightBackground({ mode }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    let mounted = true;
    let rafId = 0;

    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };
    resize();
    window.addEventListener('resize', resize);

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    const size = { cw: window.innerWidth, ch: window.innerHeight };
    let angle = 0;

    const floaters = makeFloaters(mode, size);

    let lastTime = performance.now();

    const loop = () => {
      if (!mounted) return;
      const now = performance.now();
      const dt = (now - lastTime) / MS_PER_SECOND;
      lastTime = now;
      angle += dt * ANGLE_SPEED;

      ctx.clearRect(0, 0, size.cw, size.ch);

      if (mode === 'landing') {
        drawLandingFrame(ctx, size, angle);
      } else {
        drawLobbyFrame(ctx, floaters, size);
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      mounted = false;
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(rafId);
    };
  }, [mode]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: -1,
        pointerEvents: 'none',
      }}
    />
  );
}
