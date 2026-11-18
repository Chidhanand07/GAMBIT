// Icon path data of the game screen, exactly as in design/Game.dc.html (24×24 grid).
export const GAME_ICONS = {
    flip: 'M7 16V4M7 4 3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4',
    draw: 'M5 9h14M5 15h14',
    resign: 'M4 22V4M4 4h13l-2 4 2 4H4',
    focusEnter: 'M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3',
    focusExit: 'M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3',
    // The offline screen's Takeback icon (Analysis/Game mockups have no live takeback button).
    takeback: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-1',
} as const;
