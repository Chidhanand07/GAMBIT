import { AnalysisRoute, type AnalysisSearchParams } from '@/features/analysis/components/AnalysisRoute';

/** /analysis, or /analysis?game=<id> to open a finished game with its review (F-134). */
export default function AnalysisPage({ searchParams }: { searchParams?: Promise<AnalysisSearchParams> }) {
    return <AnalysisRoute searchParams={searchParams} />;
}
