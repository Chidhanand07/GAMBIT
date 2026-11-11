// Offscreen samplers: points inside / on the outline of the ♞ glyph, scaled into a destination box.

interface Point {
    x: number;
    y: number;
}

const SIZE = 320;
const ALPHA_THRESHOLD = 64;
const DEST_SCALE = 0.52;
const KNIGHT_GLYPH = '♞';

function sampleGlyph(
    count: number,
    destW: number,
    destH: number,
    paint: (ctx: CanvasRenderingContext2D) => void,
): Point[] {
    const off = document.createElement('canvas');
    off.width = SIZE;
    off.height = SIZE;
    const ctx = off.getContext('2d')!;
    paint(ctx);

    const img = ctx.getImageData(0, 0, SIZE, SIZE);
    const hits: Point[] = [];
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            if (img.data[(y * SIZE + x) * 4 + 3] > ALPHA_THRESHOLD) {
                hits.push({ x, y });
            }
        }
    }

    const step = Math.max(1, Math.floor(hits.length / count));
    const sampled = hits.filter((_, i) => i % step === 0).slice(0, count);

    const scale = (Math.min(destW, destH) * DEST_SCALE) / SIZE;
    const ox = (destW - SIZE * scale) / 2;
    const oy = (destH - SIZE * scale) / 2;

    return sampled.map((pt) => ({ x: pt.x * scale + ox, y: pt.y * scale + oy }));
}

/** Returns up to `count` points inside the knight silhouette. */
export function sampleKnightPoints(count: number, destW: number, destH: number): Point[] {
    return sampleGlyph(count, destW, destH, (ctx) => {
        // Use chess knight unicode glyph — guaranteed to look like Image #4
        ctx.fillStyle = '#fff';
        ctx.font = `bold 260px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(KNIGHT_GLYPH, SIZE / 2, SIZE / 2 + 10);
    });
}

/** Returns up to `count` points on the knight outline. */
export function sampleKnightPerimeter(count: number, destW: number, destH: number): Point[] {
    return sampleGlyph(count, destW, destH, (ctx) => {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 4;
        ctx.font = `bold 260px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeText(KNIGHT_GLYPH, SIZE / 2, SIZE / 2 + 10);
    });
}
