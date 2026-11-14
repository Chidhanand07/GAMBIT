'use client';

import { useEffect, useState } from 'react';
import { requestEngineAnalysis } from '@/lib/api/analysis';
import type { EngineAnalysis } from '../types';

const ENGINE_DEBOUNCE_MS = 500;

interface EngineResult {
    fen: string;
    data: EngineAnalysis | null;
    failed: boolean;
}

/**
 * Engine evaluation of `fen` (undefined before the board exists), re-requested
 * 500 ms after the position changes while the engine is enabled. A failed
 * request (status, network or an unreadable body) sets `engineFailed` instead
 * of showing a 0.0 evaluation (F14). Results are kept per position, so a
 * result for an earlier position is never shown for the current one.
 */
export function useEngineAnalysis(fen: string | undefined) {
    const [engineEnabled, setEngineEnabled] = useState(false);
    const [result, setResult] = useState<EngineResult | null>(null);

    useEffect(() => {
        if (!engineEnabled || fen === undefined) return;
        let active = true;
        const t = setTimeout(() => {
            void requestEngineAnalysis(fen)
                .then((data) => ({ fen, data, failed: false }))
                .catch(() => ({ fen, data: null, failed: true }))
                .then((next) => {
                    if (active) setResult(next);
                });
        }, ENGINE_DEBOUNCE_MS);
        return () => {
            active = false;
            clearTimeout(t);
        };
    }, [fen, engineEnabled]);

    const current = engineEnabled && result !== null && result.fen === fen ? result : null;
    const clearEngineData = () => setResult(null);
    return {
        engineEnabled,
        setEngineEnabled,
        engineData: current?.data ?? null,
        engineFailed: current?.failed ?? false,
        clearEngineData,
    };
}
