/**
 * One parity case: a page in one state at one width. Captures the mockup, then the app (signed
 * out, signed in with a seeded account, or a live game), diffs them and returns the result.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Browser } from '@playwright/test';
import { startRealGame } from '../fixtures/realGame';
import { settings, VIEWPORT_HEIGHTS, type ParityWidth } from '../config/settings';
import { appMaskSelector, type ParityMask, type ParityPage, type ParityScenario } from '../config/types';
import { capture, pngSize } from './capture';
import { diffScreenshots } from './diff';
import { caseName, type CaseResult } from './results';
import { PENDING_REASON, storageStatePath, testEnvStatus } from './testEnv';

interface Case {
    page: ParityPage;
    scenario: ParityScenario;
    width: ParityWidth;
}

const viewportOf = (width: ParityWidth) => ({ width, height: VIEWPORT_HEIGHTS[width] });
const masksOf = (c: Case): ParityMask[] => [...c.page.masks, ...(c.scenario.masks ?? [])];

function filesOf(c: Case) {
    const base = caseName(c.page.id, c.scenario.id, c.width);
    const abs = (suffix: string) => path.join(settings.imagesDir, `${base}.${suffix}.png`);
    return { app: abs('app'), mockup: abs('mockup'), diff: abs('diff') };
}

const rel = (file: string) => path.relative(settings.outDir, file);

async function captureMockup(browser: Browser, c: Case, file: string): Promise<string[]> {
    const mockupPath = path.join(settings.mockupDir, c.page.mockupFile);
    if (!fs.existsSync(mockupPath)) throw new Error(`mockup not found: ${mockupPath} (set PARITY_MOCKUP_DIR)`);
    const context = await browser.newContext({ viewport: viewportOf(c.width), reducedMotion: 'reduce' });
    try {
        const page = await context.newPage();
        const masks = masksOf(c).map((m) => m.mockup);
        const url = pathToFileURL(mockupPath).href;
        return (
            await capture(page, { side: 'mockup', url, steps: c.scenario.steps ?? [], width: c.width, masks, file })
        ).misses;
    } finally {
        await context.close();
    }
}

async function captureApp(browser: Browser, c: Case, file: string): Promise<string[]> {
    const masks = masksOf(c).map(appMaskSelector);
    const steps = c.scenario.steps ?? [];
    if (c.page.route === null) {
        const game = await startRealGame(browser, viewportOf(c.width));
        try {
            return (await capture(game.white, { side: 'app', steps, width: c.width, masks, file })).misses;
        } finally {
            await game.close();
        }
    }
    const storageState = c.page.role === 'anon' ? undefined : storageStatePath(c.page.role);
    const context = await browser.newContext({
        baseURL: settings.baseURL,
        viewport: viewportOf(c.width),
        reducedMotion: 'reduce',
        storageState,
    });
    try {
        const page = await context.newPage();
        return (await capture(page, { side: 'app', url: c.page.route, steps, width: c.width, masks, file })).misses;
    } finally {
        await context.close();
    }
}

function baseResult(c: Case): CaseResult {
    return {
        pageId: c.page.id,
        pageLabel: c.page.label,
        scenarioId: c.scenario.id,
        scenarioLabel: c.scenario.label,
        width: c.width,
        status: 'error',
        percent: null,
        regions: [],
        maskMisses: { app: [], mockup: [] },
        images: {},
        sizes: {},
    };
}

export async function runCase(browser: Browser, c: Case): Promise<CaseResult> {
    const files = filesOf(c);
    const result = baseResult(c);
    fs.mkdirSync(settings.imagesDir, { recursive: true });
    try {
        result.maskMisses.mockup = await captureMockup(browser, c, files.mockup);
        result.images.mockup = rel(files.mockup);
        result.sizes.mockup = pngSize(files.mockup);
        if (c.page.role !== 'anon' && !testEnvStatus().ok)
            return { ...result, status: 'pending', reason: PENDING_REASON };
        result.maskMisses.app = await captureApp(browser, c, files.app);
        result.images.app = rel(files.app);
        result.sizes.app = pngSize(files.app);
        const diff = diffScreenshots(files.app, files.mockup, files.diff);
        result.images.diff = rel(files.diff);
        const pass = diff.percent <= settings.maxDiffPercent;
        return { ...result, status: pass ? 'pass' : 'fail', percent: diff.percent, regions: diff.regions };
    } catch (err) {
        return { ...result, status: 'error', reason: (err as Error).message.split('\n')[0] };
    }
}
