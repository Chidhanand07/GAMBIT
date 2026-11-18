// Icon path data of the game screen, exactly as in design/Game.dc.html (24×24 grid).
export const GAME_ICONS = {
    flip: 'M7 16V4M7 4 3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4',
    draw: 'M5 9h14M5 15h14',
    resign: 'M4 22V4M4 4h13l-2 4 2 4H4',
    focusEnter: 'M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3',
    focusExit: 'M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3',
    // Not in the mockup (the sound toggle is kept from the old page): same stroke style.
    soundOn: 'M11 5 6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14',
    soundOff: 'M11 5 6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6',
} as const;
