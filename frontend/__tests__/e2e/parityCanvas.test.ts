/** @jest-environment node */
import { DIFF_RGB, PAD_RGB, REGION_CELL, diffPercent, padTo, worstRegions, type Rgba } from '@/e2e/parity/lib/canvas'

const solid = (width: number, height: number, rgb: readonly number[]): Rgba => {
    const data = new Uint8Array(width * height * 4)
    for (let i = 0; i < width * height; i++) data.set([rgb[0], rgb[1], rgb[2], 255], i * 4)
    return { width, height, data }
}
const pixel = (img: Rgba, x: number, y: number) => Array.from(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 3))

describe('parity canvas helpers', () => {
    it('pads a smaller screenshot top-left on a canvas filled with the pad colour', () => {
        const padded = padTo(solid(2, 2, [10, 20, 30]), 3, 4)
        expect(padded.width).toBe(3)
        expect(padded.height).toBe(4)
        expect(pixel(padded, 1, 1)).toEqual([10, 20, 30])
        expect(pixel(padded, 2, 0)).toEqual([...PAD_RGB])
        expect(pixel(padded, 0, 3)).toEqual([...PAD_RGB])
    })

    it('returns the same image when it already has the canvas size', () => {
        const img = solid(2, 2, [1, 2, 3])
        expect(padTo(img, 2, 2)).toBe(img)
    })

    it('reports differing pixels as a percentage with two decimals', () => {
        expect(diffPercent(5, 100, 10)).toBe(0.5)
        expect(diffPercent(1, 3, 1)).toBe(33.33)
        expect(diffPercent(0, 0, 0)).toBe(0)
    })

    it('ranks grid cells by their share of diff-coloured pixels', () => {
        const diff = solid(REGION_CELL * 2, REGION_CELL, [200, 200, 200])
        for (let y = 0; y < 10; y++) for (let x = REGION_CELL; x < REGION_CELL + 40; x++) diff.data.set([...DIFF_RGB], (y * diff.width + x) * 4)
        const regions = worstRegions(diff)
        expect(regions).toHaveLength(1)
        expect(regions[0]).toMatchObject({ x: REGION_CELL, y: 0, width: REGION_CELL, height: REGION_CELL })
        expect(regions[0].percent).toBeCloseTo((400 / (REGION_CELL * REGION_CELL)) * 100, 1)
    })
})
