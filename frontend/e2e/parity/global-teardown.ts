/** After the run: PARITY.md from every case's result file. */
import fs from 'node:fs';
import { PARITY_PAGES } from './config/pages';
import { PARITY_WIDTHS, settings } from './config/settings';
import { buildReport } from './lib/report';
import { readResults } from './lib/results';

export default async function globalTeardown(): Promise<void> {
    const markdown = buildReport(readResults(settings.resultsDir), {
        pages: PARITY_PAGES,
        widths: PARITY_WIDTHS,
        maxDiffPercent: settings.maxDiffPercent,
        generatedAt: new Date().toISOString(),
        outDir: settings.outDir,
    });
    fs.mkdirSync(settings.outDir, { recursive: true });
    fs.writeFileSync(settings.reportFile, markdown);
}
