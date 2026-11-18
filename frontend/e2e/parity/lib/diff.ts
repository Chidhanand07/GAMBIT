/**
 * Pixel diff of two full-page screenshots with pixelmatch (ADR F-096). Screenshots of different
 * sizes are padded onto one canvas, so a height or width mismatch counts as differing pixels.
 */
import fs from 'node:fs';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { DIFF_RGB, diffPercent, padTo, worstRegions, type Region, type Rgba } from './canvas';

/** pixelmatch colour threshold (0..1); its default, which ignores sub-perceptual noise. */
const COLOR_THRESHOLD = 0.1;

export interface DiffResult {
    percent: number;
    diffPixels: number;
    width: number;
    height: number;
    regions: Region[];
}

const readPng = (file: string): Rgba => {
    const png = PNG.sync.read(fs.readFileSync(file));
    return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
};

/** Compares `appFile` with `mockupFile` and writes the pixelmatch image to `diffFile`. */
export function diffScreenshots(appFile: string, mockupFile: string, diffFile: string): DiffResult {
    const app = readPng(appFile);
    const mockup = readPng(mockupFile);
    const width = Math.max(app.width, mockup.width);
    const height = Math.max(app.height, mockup.height);
    const out = new PNG({ width, height });
    const diffPixels = pixelmatch(
        padTo(app, width, height).data,
        padTo(mockup, width, height).data,
        out.data,
        width,
        height,
        {
            threshold: COLOR_THRESHOLD,
            diffColor: [DIFF_RGB[0], DIFF_RGB[1], DIFF_RGB[2]],
        },
    );
    fs.writeFileSync(diffFile, PNG.sync.write(out));
    const regions = worstRegions({ width, height, data: new Uint8Array(out.data) });
    return { percent: diffPercent(diffPixels, width, height), diffPixels, width, height, regions };
}
