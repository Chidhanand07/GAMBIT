// @ts-check

/**
 * Build a PGN movetext string from a game's move log (each entry has a `san`).
 * Entries without a SAN are skipped; returns null when nothing is left.
 * @param {Array<{ san?: string } | null | undefined> | null | undefined} moveLog
 * @returns {string | null}
 */
function buildPgnFromMoveLog(moveLog) {
    const sans = (moveLog || []).map((m) => m && m.san).filter(Boolean);
    if (!sans.length) return null;
    let movetext = '';
    for (let i = 0; i < sans.length; i++) {
        if (i % 2 === 0) movetext += `${i / 2 + 1}. `;
        movetext += `${sans[i]} `;
    }
    // Minimal headers so python-chess parses it as a game.
    return `[Event "GAMBIT"]\n[Site "GAMBIT"]\n\n${movetext.trim()} *`;
}

module.exports = { buildPgnFromMoveLog };
