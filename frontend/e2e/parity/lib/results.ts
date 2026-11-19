/**
 * One JSON file per page × state × width under `<out>/parity/results/`, written by the spec and
 * read back by the global teardown to build PARITY.md. Files, not memory: workers are processes.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Region } from './canvas';

export type CaseStatus = 'pass' | 'fail' | 'pending' | 'error';

export interface CaseResult {
    pageId: string;
    pageLabel: string;
    scenarioId: string;
    scenarioLabel: string;
    width: number;
    status: CaseStatus;
    percent: number | null;
    /** Why a case is pending or errored. */
    reason?: string;
    regions: Region[];
    /** Mask selectors that matched nothing, per side. */
    maskMisses: { app: string[]; mockup: string[] };
    /** Image paths relative to the output directory. */
    images: { app?: string; mockup?: string; diff?: string };
    /** Full-page sizes, "1440x1614". */
    sizes: { app?: string; mockup?: string };
}

export const caseName = (pageId: string, scenarioId: string, width: number) => `${pageId}__${scenarioId}__${width}`;

export function writeResult(resultsDir: string, result: CaseResult): void {
    fs.mkdirSync(resultsDir, { recursive: true });
    const file = path.join(resultsDir, `${caseName(result.pageId, result.scenarioId, result.width)}.json`);
    fs.writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
}

export function readResults(resultsDir: string): CaseResult[] {
    if (!fs.existsSync(resultsDir)) return [];
    return fs
        .readdirSync(resultsDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => JSON.parse(fs.readFileSync(path.join(resultsDir, f), 'utf8')) as CaseResult);
}

/** Empties the results folder and the images of the previous run (keeps the folder itself). */
export function resetOutput(imagesDir: string, resultsDir: string): void {
    fs.rmSync(imagesDir, { recursive: true, force: true });
    fs.mkdirSync(resultsDir, { recursive: true });
}
