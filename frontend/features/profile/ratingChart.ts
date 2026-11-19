// "Rating over time" (Profile.dc.html): the chart's numbers and SVG paths from a rating series
// (lib/server/ratingHistory, F-121). Pure; the geometry is the mockup's.

/** The chart's viewBox is 600 × 160. */
export const CHART_WIDTH = 600;
export const CHART_HEIGHT = 160;
/** y of the lowest value, and the height the values span above it. */
const BASELINE_Y = 150;
const PLOT_HEIGHT = 140;
/** Rating points of headroom above the peak and below the low. */
const PADDING = 8;

export interface RatingChart {
    peak: number;
    low: number;
    /** "+39" / "-12" / "0": last minus first. */
    delta: string;
    /** Rated games in the series (one fewer than its points). */
    games: number;
    line: string;
    area: string;
}

function points(series: readonly number[]): [number, number][] {
    const min = Math.min(...series) - PADDING;
    const max = Math.max(...series) + PADDING;
    const span = Math.max(1, max - min);
    const last = series.length - 1;
    return series.map((v, i) => [
        last === 0 ? 0 : (i / last) * CHART_WIDTH,
        BASELINE_Y - ((v - min) / span) * PLOT_HEIGHT,
    ]);
}

/** The chart for a series, or null when it holds no recorded game (fewer than two points). */
export function ratingChart(series: readonly number[] | null | undefined): RatingChart | null {
    if (!series || series.length < 2) return null;
    const line = points(series)
        .map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`)
        .join(' ');
    const change = series[series.length - 1] - series[0];
    return {
        peak: Math.max(...series),
        low: Math.min(...series),
        delta: change >= 0 ? `+${change}` : String(change),
        games: series.length - 1,
        line,
        area: `${line} L${CHART_WIDTH} ${CHART_HEIGHT} L0 ${CHART_HEIGHT}Z`,
    };
}
