/**
 * PARITY.md from the per-case results (pure: string in, string out, unit-tested).
 */
import type { Region } from './canvas';
import type { CaseResult } from './results';

export interface ReportPage {
    id: string;
    label: string;
    scenarios: readonly { id: string; label: string }[];
}

export interface ReportOptions {
    pages: readonly ReportPage[];
    widths: readonly number[];
    maxDiffPercent: number;
    generatedAt: string;
    /** Folder the image paths are relative to, as shown to the reader. */
    outDir: string;
}

const key = (pageId: string, scenarioId: string, width: number) => `${pageId}|${scenarioId}|${width}`;

function cell(result: CaseResult | undefined): string {
    if (!result) return 'not run';
    if (result.status === 'pending') return 'pending';
    if (result.status === 'error') return 'ERROR';
    return `${result.status === 'pass' ? 'PASS' : 'FAIL'} ${(result.percent ?? 0).toFixed(2)}%`;
}

const regionText = (r: Region) => `x ${r.x}-${r.x + r.width}, y ${r.y}-${r.y + r.height} (${r.percent.toFixed(1)}%)`;

function table(byKey: Map<string, CaseResult>, o: ReportOptions): string[] {
    const head = ['| Page | State |', ...o.widths.map((w) => ` ${w} |`)].join('');
    const rule = ['|---|---|', ...o.widths.map(() => '---|')].join('');
    const rows = o.pages.flatMap((p) =>
        p.scenarios.map(
            (s) =>
                `| ${p.label} | ${s.label} |${o.widths.map((w) => ` ${cell(byKey.get(key(p.id, s.id, w)))} |`).join('')}`,
        ),
    );
    return [head, rule, ...rows];
}

function summary(results: readonly CaseResult[], maxDiffPercent: number): string[] {
    const count = (s: CaseResult['status']) => results.filter((r) => r.status === s).length;
    return [
        `Target: at most ${maxDiffPercent}% differing pixels per page, state and width (masked data regions excluded).`,
        '',
        `Cases: ${results.length} - pass ${count('pass')}, fail ${count('fail')}, error ${count('error')}, pending ${count('pending')}.`,
    ];
}

function failures(results: readonly CaseResult[]): string[] {
    const failed = results
        .filter((r) => r.status === 'fail' || r.status === 'error')
        .sort((a, b) => (b.percent ?? Infinity) - (a.percent ?? Infinity));
    if (failed.length === 0) return [];
    const lines = failed.map((r) => {
        const what = `${r.pageLabel} / ${r.scenarioLabel} @ ${r.width}px`;
        if (r.status === 'error') return `- **${what}**: error - ${r.reason ?? 'unknown'}`;
        const sizes =
            r.sizes.app === r.sizes.mockup ? `size ${r.sizes.app}` : `app ${r.sizes.app} vs mockup ${r.sizes.mockup}`;
        const regions = r.regions.length ? `; worst: ${r.regions.map(regionText).join('; ')}` : '';
        return `- **${what}**: ${(r.percent ?? 0).toFixed(2)}% (${sizes}) - \`${r.images.diff}\`${regions}`;
    });
    return ['', '## Failures, worst first', '', ...lines];
}

function maskMisses(results: readonly CaseResult[]): string[] {
    const lines = results.flatMap((r) => {
        const misses = [
            ...r.maskMisses.app.map((s) => `app \`${s}\``),
            ...r.maskMisses.mockup.map((s) => `mockup \`${s}\``),
        ];
        return misses.length ? [`- ${r.pageLabel} / ${r.scenarioLabel} @ ${r.width}px: ${misses.join(', ')}`] : [];
    });
    return lines.length ? ['', '## Mask selectors that matched nothing', '', ...lines] : [];
}

function pending(results: readonly CaseResult[]): string[] {
    const reasons = [...new Set(results.filter((r) => r.status === 'pending').map((r) => r.reason ?? 'pending'))];
    return reasons.length ? ['', '## Pending', '', ...reasons.map((r) => `- ${r}`)] : [];
}

export function buildReport(results: readonly CaseResult[], o: ReportOptions): string {
    const byKey = new Map(results.map((r) => [key(r.pageId, r.scenarioId, r.width), r]));
    return [
        '# Visual parity: app vs mockups',
        '',
        `Generated ${o.generatedAt} by \`npm run test:parity\` (frontend/e2e/parity). Images: \`${o.outDir}/parity/\`.`,
        '',
        ...summary(results, o.maxDiffPercent),
        '',
        ...table(byKey, o),
        ...failures(results),
        ...maskMisses(results),
        ...pending(results),
        '',
    ].join('\n');
}
