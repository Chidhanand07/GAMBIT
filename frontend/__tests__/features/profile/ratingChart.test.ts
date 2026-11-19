import { ratingChart } from '@/features/profile/ratingChart';

describe('ratingChart [F-121]', () => {
    test('no chart without a recorded game', () => {
        expect(ratingChart(null)).toBeNull();
        expect(ratingChart([])).toBeNull();
        expect(ratingChart([1200])).toBeNull();
    });

    test("peak, low, change and games: the mockup's numbers", () => {
        expect(ratingChart([1200, 1122, 1161, 1025])).toMatchObject({ peak: 1200, low: 1025, delta: '-175', games: 3 });
        expect(ratingChart([1200, 1239])).toMatchObject({ delta: '+39', games: 1 });
        expect(ratingChart([1200, 1200])!.delta).toBe('+0');
    });

    test("paths use the mockup's geometry: 600 × 160, 8 points of headroom, 140 px of plot", () => {
        const chart = ratingChart([1200, 1216, 1208])!;
        // min 1192, max 1224, span 32: 1200 → y 115, 1216 → y 45, 1208 → y 80
        expect(chart.line).toBe('M0.0 115.0 L300.0 45.0 L600.0 80.0');
        expect(chart.area).toBe('M0.0 115.0 L300.0 45.0 L600.0 80.0 L600 160 L0 160Z');
    });

    test('a flat series stays inside the plot', () => {
        expect(ratingChart([1200, 1200])!.line).toBe('M0.0 80.0 L600.0 80.0');
    });
});
