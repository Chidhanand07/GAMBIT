// DOM controller for the background hover trail (design/HANDOFF.md §4.1).
//
// Everything here works on elements directly (refs, classes, inline left/top) so a pointer
// move never re-renders React: one rAF-throttled read of the root's box per frame, then writes.
import { cellAt, cellIndex, columnsFor, glyphForCell } from './glyphIndex';

export interface HoverTrailElements {
    /** The page root the pointer is tracked on (`position: relative`, behind-content stacking). */
    root: HTMLElement;
    /** The `.g-trail` grid that receives the `.tc` cells. */
    grid: HTMLElement;
    /** The `.ghl` active-cell highlight. */
    highlight: HTMLElement;
}

interface Cell {
    col: number;
    row: number;
    glyph: string;
}

/** Trail cell size in CSS pixels, read from the `--trail-cell` token on the root. */
function readCellSize(root: HTMLElement): number {
    return parseFloat(getComputedStyle(root).getPropertyValue('--trail-cell'));
}

/** Adds or removes `.tc` cells until the grid has `count` of them. */
function fillGrid(grid: HTMLElement, count: number) {
    const extra = grid.children.length - count;
    for (let i = 0; i < extra; i++) grid.lastElementChild?.remove();
    if (extra >= 0) return;
    const fragment = document.createDocumentFragment();
    for (let i = extra; i < 0; i++) {
        const cell = document.createElement('span');
        cell.className = 'tc';
        fragment.appendChild(cell);
    }
    grid.appendChild(fragment);
}

function placeAt(el: HTMLElement, cell: Cell, cellSize: number) {
    el.style.left = `${cell.col * cellSize}px`;
    el.style.top = `${cell.row * cellSize}px`;
}

/** A fading `.gtrace` copy of the cell the pointer just left; it removes itself when done. */
function spawnTrace(root: HTMLElement, cell: Cell, cellSize: number, live: Set<HTMLElement>) {
    const trace = document.createElement('span');
    trace.className = 'gtrace';
    trace.setAttribute('aria-hidden', 'true');
    trace.textContent = cell.glyph;
    placeAt(trace, cell, cellSize);
    trace.addEventListener('animationend', () => {
        trace.remove();
        live.delete(trace);
    });
    live.add(trace);
    root.appendChild(trace);
}

/**
 * Starts the trail on `root` and returns its cleanup. Does nothing (and returns a no-op) when the
 * `--trail-cell` token is missing, e.g. outside the app's stylesheet.
 */
export function attachHoverTrail({ root, grid, highlight }: HoverTrailElements): () => void {
    const cellSize = readCellSize(root);
    if (!(cellSize > 0)) return () => {};
    const traces = new Set<HTMLElement>();
    let cols = 1;
    let frame = 0;
    let pointer: { clientX: number; clientY: number } | null = null;
    let current: Cell | null = null;

    const resize = () => {
        cols = columnsFor(root.offsetWidth, cellSize);
        fillGrid(grid, cols * Math.ceil(root.offsetHeight / cellSize));
    };

    const update = () => {
        frame = 0;
        if (!pointer) return;
        const box = root.getBoundingClientRect();
        const scale = root.offsetWidth ? box.width / root.offsetWidth : 1;
        const { col, row } = cellAt(
            (pointer.clientX - box.left) / scale,
            (pointer.clientY - box.top) / scale,
            cellSize,
        );
        if (current && current.col === col && current.row === row) return;
        if (current) spawnTrace(root, current, cellSize, traces);
        current = { col, row, glyph: glyphForCell(cellIndex(col, row, cols)) };
        highlight.textContent = current.glyph;
        placeAt(highlight, current, cellSize);
        highlight.classList.add('on');
    };

    const onMove = (e: MouseEvent) => {
        pointer = { clientX: e.clientX, clientY: e.clientY };
        if (!frame) frame = requestAnimationFrame(update);
    };

    const onLeave = () => {
        pointer = null;
        current = null;
        highlight.classList.remove('on');
    };

    resize();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(root);
    root.addEventListener('mousemove', onMove);
    root.addEventListener('mouseleave', onLeave);

    return () => {
        root.removeEventListener('mousemove', onMove);
        root.removeEventListener('mouseleave', onLeave);
        observer?.disconnect();
        if (frame) cancelAnimationFrame(frame);
        traces.forEach((trace) => trace.remove());
        traces.clear();
        grid.replaceChildren();
        highlight.classList.remove('on');
    };
}
