/**
 * Pure RGBA helpers for the parity diff (no PNG or pixelmatch import, so Jest can test them).
 * An image is `{ width, height, data }` with 4 bytes per pixel, as pngjs stores it.
 */
export interface Rgba {
    width: number;
    height: number;
    data: Uint8Array;
}

export interface Region {
    x: number;
    y: number;
    width: number;
    height: number;
    /** Share of this cell's pixels that differ, in percent. */
    percent: number;
}

const CHANNELS = 4;
const OPAQUE = 255;
/** Padding colour for the part of the canvas one screenshot does not cover: it always differs. */
export const PAD_RGB: readonly [number, number, number] = [0, 255, 255];
/** The colour pixelmatch paints differing pixels with (set explicitly in diff.ts). */
export const DIFF_RGB: readonly [number, number, number] = [255, 0, 0];
/** Hot-spot grid cell, in CSS pixels (screenshots are taken at device scale 1). */
export const REGION_CELL = 160;
const PERCENT = 100;

/** `img` on a `width`×`height` canvas, top-left aligned, the rest filled with PAD_RGB. */
export function padTo(img: Rgba, width: number, height: number): Rgba {
    if (img.width === width && img.height === height) return img;
    const data = new Uint8Array(width * height * CHANNELS);
    for (let i = 0; i < width * height; i += 1) {
        data.set([...PAD_RGB, OPAQUE], i * CHANNELS);
    }
    for (let y = 0; y < img.height; y += 1) {
        const row = img.data.subarray(y * img.width * CHANNELS, (y + 1) * img.width * CHANNELS);
        data.set(row, y * width * CHANNELS);
    }
    return { width, height, data };
}

/** Differing pixels as a percentage of the canvas, rounded to two decimals. */
export function diffPercent(diffPixels: number, width: number, height: number): number {
    const total = width * height;
    return total === 0 ? 0 : Math.round((diffPixels / total) * PERCENT * PERCENT) / PERCENT;
}

const isDiffPixel = (d: Uint8Array, i: number) =>
    d[i] === DIFF_RGB[0] && d[i + 1] === DIFF_RGB[1] && d[i + 2] === DIFF_RGB[2];

function countCell(diff: Rgba, x0: number, y0: number): Region {
    const width = Math.min(REGION_CELL, diff.width - x0);
    const height = Math.min(REGION_CELL, diff.height - y0);
    let hits = 0;
    for (let y = y0; y < y0 + height; y += 1) {
        for (let x = x0; x < x0 + width; x += 1) {
            if (isDiffPixel(diff.data, (y * diff.width + x) * CHANNELS)) hits += 1;
        }
    }
    return { x: x0, y: y0, width, height, percent: diffPercent(hits, width, height) };
}

/** The `limit` grid cells of a pixelmatch output with the highest share of differing pixels. */
export function worstRegions(diff: Rgba, limit = 3): Region[] {
    const cells: Region[] = [];
    for (let y = 0; y < diff.height; y += REGION_CELL) {
        for (let x = 0; x < diff.width; x += REGION_CELL) cells.push(countCell(diff, x, y));
    }
    return cells
        .filter((c) => c.percent > 0)
        .sort((a, b) => b.percent - a.percent)
        .slice(0, limit);
}
