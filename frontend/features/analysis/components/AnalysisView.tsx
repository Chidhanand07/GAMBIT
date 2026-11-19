import type { ReactNode } from 'react';

interface AnalysisViewProps {
    evalBar: ReactNode;
    board: ReactNode;
    controls: ReactNode;
    panel: ReactNode;
}

/** Page layout of Analysis.dc.html: title, eval bar + board + controls, and the side panel. */
export function AnalysisView({ evalBar, board, controls, panel }: AnalysisViewProps) {
    return (
        <div className="mx-auto box-border flex max-w-[1280px] flex-col gap-6 px-8 pb-16 pt-9">
            <h1 className="m-0 font-display text-[52px] font-bold leading-[1.02] tracking-[-0.03em]">Analysis</h1>
            <div className="flex flex-wrap items-start gap-8">
                <section className="flex min-w-0 max-w-[720px] flex-[999_1_420px] flex-col gap-4">
                    <div className="flex items-stretch gap-3">
                        {evalBar}
                        <div className="min-w-0 flex-[1_1_0]">{board}</div>
                    </div>
                    {controls}
                </section>
                {panel}
            </div>
        </div>
    );
}
