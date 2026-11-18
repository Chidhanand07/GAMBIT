/**
 * Loads a page (app or mockup), runs a state's steps, and takes the masked full-page screenshot.
 */
import fs from 'node:fs';
import type { Page } from '@playwright/test';
import { MASK_COLOR, SCREENSHOT_CSS, type ParityWidth } from '../config/settings';
import type { ParityStep } from '../config/types';

export type Side = 'app' | 'mockup';

/** Time for React effects, fonts and transitions to settle after load and after each step. */
const SETTLE_MS = 600;
/** The app's dev server keeps polling some endpoints; do not wait for idle longer than this. */
const NETWORK_IDLE_MS = 8000;
const PNG_WIDTH_OFFSET = 16;
const PNG_HEIGHT_OFFSET = 20;
const PNG_HEADER_BYTES = 24;

export interface CaptureOptions {
    side: Side;
    /** Omitted when the page is already open (the live-game fixture). */
    url?: string;
    steps: readonly ParityStep[];
    width: ParityWidth;
    masks: readonly string[];
    file: string;
}

async function load(page: Page, side: Side, url: string): Promise<void> {
    if (side === 'mockup') {
        await page.goto(url, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => (document.body?.innerText ?? '').trim().length > 0);
        return;
    }
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_MS }).catch(() => undefined);
}

async function settle(page: Page): Promise<void> {
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.waitForTimeout(SETTLE_MS);
}

async function runSteps(page: Page, side: Side, steps: readonly ParityStep[], width: ParityWidth): Promise<void> {
    for (const step of steps) {
        if (step.onlyWidths && !step.onlyWidths.includes(width)) continue;
        const target = page.locator(step[side]).first();
        if (step.action === 'hover') await target.hover();
        else await target.click();
        await settle(page);
    }
}

/** Screenshots the page with every matching mask painted; returns the selectors that matched nothing. */
export async function capture(page: Page, o: CaptureOptions): Promise<{ misses: string[] }> {
    if (o.url) await load(page, o.side, o.url);
    await settle(page);
    await runSteps(page, o.side, o.steps, o.width);
    const misses: string[] = [];
    const mask = [];
    for (const selector of o.masks) {
        const locator = page.locator(selector);
        if ((await locator.count()) === 0) misses.push(selector);
        else mask.push(locator);
    }
    await page.screenshot({
        path: o.file,
        fullPage: true,
        animations: 'disabled',
        caret: 'hide',
        scale: 'css',
        mask,
        maskColor: MASK_COLOR,
        style: SCREENSHOT_CSS,
    });
    return { misses };
}

/** "1440x1614" from a PNG's IHDR chunk. */
export function pngSize(file: string): string {
    const head = fs.readFileSync(file).subarray(0, PNG_HEADER_BYTES);
    return `${head.readUInt32BE(PNG_WIDTH_OFFSET)}x${head.readUInt32BE(PNG_HEIGHT_OFFSET)}`;
}
