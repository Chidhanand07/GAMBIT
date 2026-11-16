// Board themes (Settings.dc.html) and frames (Main, Game, Analysis, Home, Settings mockups).

export type BoardTheme = 'maple' | 'green' | 'slate' | 'walnut';
export type BoardFrame = 'compact' | 'game' | 'analysis' | 'hero' | 'preview';

/** Square fills and the coordinate ink drawn on them (the opposite square colour). */
export const THEMES: Record<BoardTheme, { light: string; dark: string; lightInk: string; darkInk: string }> = {
    maple: { light: 'bg-board-light', dark: 'bg-board-dark', lightInk: 'text-board-dark', darkInk: 'text-board-light' },
    green: {
        light: 'bg-board-green-light',
        dark: 'bg-board-green-dark',
        lightInk: 'text-board-green-dark',
        darkInk: 'text-board-green-light',
    },
    slate: {
        light: 'bg-board-slate-light',
        dark: 'bg-board-slate-dark',
        lightInk: 'text-board-slate-dark',
        darkInk: 'text-board-slate-light',
    },
    walnut: {
        light: 'bg-board-walnut-light',
        dark: 'bg-board-walnut-dark',
        lightInk: 'text-board-walnut-dark',
        darkInk: 'text-board-walnut-light',
    },
};

/** Frame border, radius and shadow per mockup. */
export const FRAMES: Record<BoardFrame, string> = {
    compact: 'rounded-12 border-[6px] border-board-frame', // Main.dc.html lobby card
    game: 'rounded-14 border-8 border-board-frame', // Game.dc.html
    analysis: 'rounded-12 border-8 border-board-frame shadow-board-analysis', // Analysis.dc.html
    hero: 'rounded-12 border-[10px] border-board-frame shadow-board-hero', // Home.dc.html
    preview: 'rounded-10 shadow-board-preview', // Settings.dc.html live preview
};
