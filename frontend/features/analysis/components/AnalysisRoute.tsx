'use client';

import { use } from 'react';
import { AnalysisContainer } from './AnalysisContainer';

export type AnalysisSearchParams = { game?: string | string[] };

/** The `game` query parameter, when it is a single non-empty value (the route validates it). */
export function gameIdFrom(params: AnalysisSearchParams): string | null {
    return typeof params.game === 'string' && params.game ? params.game : null;
}

/** Reads `?game=` from the page's search params and opens the analysis screen with it. */
export function AnalysisRoute({ searchParams }: { searchParams?: Promise<AnalysisSearchParams> }) {
    const params = searchParams ? use(searchParams) : {};
    return <AnalysisContainer gameId={gameIdFrom(params)} />;
}
