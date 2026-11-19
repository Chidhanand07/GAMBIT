import type { ParityWidth } from './settings';

/** Who views the app page: signed out, or one of the seeded test accounts (scripts/test-db). */
export type ParityRole = 'anon' | 'white' | 'black' | 'viewer';

/**
 * A data-driven region (a name, rating, avatar, timestamp, move list, live count) painted with
 * the mask colour on both sides. `app` defaults to `[data-parity-mask="<key>"]`; `mockup` is a
 * Playwright selector into the rendered mockup. The layout around a mask still counts.
 */
export interface ParityMask {
    key: string;
    mockup: string;
    app?: string;
    /** Why this region is masked when it is not plain data (shown in PARITY.md). */
    note?: string;
}

/** One interaction; `app` and `mockup` are Playwright selectors for the same control. */
export interface ParityStep {
    action: 'click' | 'hover';
    app: string;
    mockup: string;
    /** Only at these widths (e.g. a control that exists only in the mobile layout). */
    onlyWidths?: readonly ParityWidth[];
}

/** A state of the page: `default` has no steps; dialogs, menus, tabs and modes add steps. */
export interface ParityScenario {
    id: string;
    label: string;
    steps?: readonly ParityStep[];
    /** Extra masks for this state only (e.g. a dialog that shows a name). */
    masks?: readonly ParityMask[];
    onlyWidths?: readonly ParityWidth[];
}

export interface ParityPage {
    id: string;
    label: string;
    /** File name in the mockup folder, e.g. `Main.dc.html`. */
    mockupFile: string;
    /** App route; `null` = the live-game fixture opens a real /game/<id>. */
    route: string | null;
    role: ParityRole;
    masks: readonly ParityMask[];
    scenarios: readonly ParityScenario[];
    note?: string;
}

/** `[data-parity-mask="<key>"]`, the app-side selector a mask uses when it names none. */
export const appMaskSelector = (mask: ParityMask): string => mask.app ?? `[data-parity-mask="${mask.key}"]`;
