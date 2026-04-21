"use client";

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';

const KnightIntro = dynamic(() => import('@/components/ui/KnightIntro'), { ssr: false });

export default function IntroGate({ children }: { children: React.ReactNode }) {
  const [showIntro, setShowIntro] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // sessionStorage clears on tab close — intro runs every fresh session
    const seen = sessionStorage.getItem('gambit_intro_seen');
    if (!seen) {
      sessionStorage.setItem('gambit_intro_seen', '1');
      setShowIntro(true);
    } else {
      setReady(true);
    }
  }, []);

  const handleComplete = useCallback(() => {
    setShowIntro(false);
    setReady(true);
  }, []);

  return (
    <>
      {showIntro && <KnightIntro onComplete={handleComplete} />}
      <div
        style={{
          opacity: ready ? 1 : 0,
          transition: ready ? 'opacity 0.5s ease' : 'none',
        }}
      >
        {children}
      </div>
    </>
  );
}
