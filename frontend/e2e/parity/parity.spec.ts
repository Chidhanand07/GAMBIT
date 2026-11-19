/**
 * Visual parity: every page × state of config/pages.ts at the project's width (ADR F-096).
 * Results go to PARITY.md and <out>/parity/ (global teardown); each case also asserts the target.
 */
import { expect, test } from '@playwright/test';
import { PARITY_PAGES } from './config/pages';
import { settings, type ParityWidth } from './config/settings';
import { runCase } from './lib/runCase';
import { writeResult } from './lib/results';

for (const page of PARITY_PAGES) {
    for (const scenario of page.scenarios) {
        test(`${page.label} - ${scenario.label}`, async ({ browser }, testInfo) => {
            const width = testInfo.project.metadata.width as ParityWidth;
            test.skip(!!scenario.onlyWidths && !scenario.onlyWidths.includes(width), 'not at this width');
            const result = await runCase(browser, { page, scenario, width });
            writeResult(settings.resultsDir, result);
            test.skip(result.status === 'pending', result.reason);
            expect(result.status, result.reason).not.toBe('error');
            expect(result.percent ?? Infinity, `diff %: ${result.images.diff}`).toBeLessThanOrEqual(
                settings.maxDiffPercent,
            );
        });
    }
}
