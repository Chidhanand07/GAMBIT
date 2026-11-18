/**
 * Visual parity harness settings (ADR F-096). Everything a CI run may need to change is an
 * environment variable; the defaults suit a local run from `frontend/`.
 *
 *   PARITY_PORT          web app dev-server port (3201)
 *   PARITY_MOCKUP_DIR    folder with the *.dc.html mockups and support.js (<repo>/design/design)
 *   PARITY_OUT_DIR       where PARITY.md and parity/ (diff images, results) go (<repo>/design)
 *   PARITY_MAX_DIFF_PCT  pass threshold, percent of differing pixels (0.5)
 *   PARITY_REUSE_SERVER  1 = use an already-running dev server on PARITY_PORT
 */
import path from 'node:path';

export const FRONTEND_DIR = path.resolve(__dirname, '..', '..', '..');
export const REPO_ROOT = path.resolve(FRONTEND_DIR, '..');

export const PARITY_WIDTHS = [375, 768, 1024, 1440, 1920] as const;
export type ParityWidth = (typeof PARITY_WIDTHS)[number];

/** Viewport heights per width (common device sizes); screenshots are full-page anyway. */
export const VIEWPORT_HEIGHTS: Readonly<Record<ParityWidth, number>> = {
    375: 812,
    768: 1024,
    1024: 768,
    1440: 900,
    1920: 1080,
};

const DEFAULT_PORT = 3201;
const DEFAULT_MAX_DIFF_PERCENT = 0.5;

const numberFrom = (value: string | undefined, fallback: number): number => {
    const n = Number(value);
    return value !== undefined && value !== '' && Number.isFinite(n) ? n : fallback;
};

const env = process.env;
const port = numberFrom(env.PARITY_PORT, DEFAULT_PORT);
const outDir = path.resolve(env.PARITY_OUT_DIR || path.join(REPO_ROOT, 'design'));

export const settings = {
    port,
    baseURL: `http://localhost:${port}`,
    mockupDir: path.resolve(env.PARITY_MOCKUP_DIR || path.join(REPO_ROOT, 'design', 'design')),
    outDir,
    reportFile: path.join(outDir, 'PARITY.md'),
    imagesDir: path.join(outDir, 'parity'),
    resultsDir: path.join(outDir, 'parity', 'results'),
    maxDiffPercent: numberFrom(env.PARITY_MAX_DIFF_PCT, DEFAULT_MAX_DIFF_PERCENT),
    reuseServer: env.PARITY_REUSE_SERVER === '1',
    authDir: path.join(FRONTEND_DIR, 'e2e', '.auth'),
} as const;

/** Colour painted over masked regions on both sides, so a mask never counts as a difference. */
export const MASK_COLOR = '#FF00FF';

/** CSS injected into every screenshot: no caret, no Next.js dev overlay or route announcer. */
export const SCREENSHOT_CSS = [
    'nextjs-portal, [data-nextjs-toast], [data-nextjs-dev-tools-button] { display: none !important; }',
    '*, *::before, *::after { caret-color: transparent !important; }',
].join('\n');
