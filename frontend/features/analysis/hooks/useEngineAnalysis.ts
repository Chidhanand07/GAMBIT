'use client';

import { useEffect, useState } from 'react';
import { requestEngineAnalysis } from '@/lib/api/analysis';
import type { EngineAnalysis } from '../types';

const ENGINE_DEBOUNCE_MS = 500;

/**
 * Engine evaluation of `fen` (undefined before the board exists), re-requested
 * 500 ms after the position changes while the engine is enabled.
 */
export function useEngineAnalysis(fen: string | undefined) {
    const [engineEnabled, setEngineEnabled] = useState(false);
    const [engineData, setEngineData] = useState<EngineAnalysis | null>(null);

    useEffect(() => {
        if (!engineEnabled || fen === undefined) {
            setEngineData(null);
            return;
        }
        let active = true;
        const t = setTimeout(async () => {
            try {
                const data = await requestEngineAnalysis(fen);
                if (active) setEngineData(data);
            } catch {
                /* engine offline */
            }
        }, ENGINE_DEBOUNCE_MS);
        return () => {
            active = false;
            clearTimeout(t);
        };
    }, [fen, engineEnabled]);

    return { engineEnabled, setEngineEnabled, engineData, setEngineData };
}
