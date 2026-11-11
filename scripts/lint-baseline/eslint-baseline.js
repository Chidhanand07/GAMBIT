/**
 * Shared helper for the ESLint legacy baseline (ratchet).
 *
 * Files listed in `<package>/.lint-baseline.json` predate the rulebook. ESLint
 * reports their violations as warnings instead of errors so CI stays green,
 * while scripts/lint-baseline/ratchet.js fails CI if a listed file grows or a
 * new file is added to the list. Every other file gets errors (SIZE-01..04).
 */
const fs = require('fs');
const path = require('path');

/** @param {string} packageDir absolute path of the package (server/ or frontend/) */
function readBaseline(packageDir) {
    const file = path.join(packageDir, '.lint-baseline.json');
    if (!fs.existsSync(file)) return {};
    return JSON.parse(fs.readFileSync(file, 'utf8')).files ?? {};
}

function toWarn(setting) {
    if (Array.isArray(setting)) return ['warn', ...setting.slice(1)];
    return setting === 'off' || setting === 0 ? setting : 'warn';
}

/**
 * Builds a flat-config block that downgrades every rule enabled by `configs`
 * to "warn" for the baselined files. Set LINT_BASELINE=off to see the real
 * errors (used by `ratchet.js --update`).
 *
 * @param {string} packageDir
 * @param {Array<object>} configs the flat-config objects whose rules apply
 */
function baselineBlock(packageDir, configs) {
    // Escape glob syntax: Next.js segments like app/game/[id] are literal paths.
    const files = Object.keys(readBaseline(packageDir)).map((f) => f.replace(/[[\]{}()*?!+@]/g, '\\$&'));
    if (!files.length || process.env.LINT_BASELINE === 'off') return [];
    const rules = {};
    for (const config of configs.flat()) {
        for (const [name, setting] of Object.entries(config.rules ?? {})) rules[name] = toWarn(setting);
    }
    return [{ name: 'legacy-baseline', files, rules }];
}

module.exports = { readBaseline, baselineBlock };
