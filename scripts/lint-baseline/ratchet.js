#!/usr/bin/env node
/**
 * Legacy-baseline ratchet (docs/ENGINEERING_RULES.md SIZE-01, "ratchet" check).
 *
 *   node scripts/lint-baseline/ratchet.js <server|frontend>            check
 *   node scripts/lint-baseline/ratchet.js <server|frontend> --update   rewrite
 *
 * check fails when:
 *   - a baselined file grew beyond its recorded line count,
 *   - a baselined file no longer exists (remove the stale entry),
 *   - BASE_REF is set (e.g. origin/preprod) and the list gained a file that the
 *     base branch's baseline does not have — the list may only shrink.
 * Non-baselined files are held to the full rules by ESLint itself.
 *
 * --update runs ESLint with the baseline disabled, keeps only files that still
 * have errors and records their current line counts. It never adds a file
 * that was not already listed, unless --init is also passed.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const pkg = process.argv[2];
const update = process.argv.includes('--update');
const init = process.argv.includes('--init');
if (!['server', 'frontend'].includes(pkg)) {
    console.error('usage: ratchet.js <server|frontend> [--update [--init]]');
    process.exit(2);
}
const pkgDir = path.join(ROOT, pkg);
const baselinePath = path.join(pkgDir, '.lint-baseline.json');

const countLines = (file) => {
    const text = fs.readFileSync(path.join(pkgDir, file), 'utf8');
    return text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
};
const readFiles = () => (fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')).files : {});

function filesWithErrors() {
    const run = spawnSync('npx', ['eslint', '.', '-f', 'json'], {
        cwd: pkgDir,
        env: { ...process.env, LINT_BASELINE: 'off' },
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
    });
    const results = JSON.parse(run.stdout);
    return results.filter((r) => r.errorCount > 0).map((r) => path.relative(pkgDir, r.filePath)).sort();
}

function writeBaseline() {
    const previous = readFiles();
    const files = {};
    for (const file of filesWithErrors()) {
        if (!init && !(file in previous)) {
            console.error(`✗ ${pkg}/${file} has lint errors but is not baselined — fix it instead.`);
            process.exitCode = 1;
            continue;
        }
        files[file] = countLines(file);
    }
    const note = 'Legacy files allowed to violate lint rules (as warnings). May only shrink; see scripts/lint-baseline/ratchet.js.';
    fs.writeFileSync(baselinePath, JSON.stringify({ note, files }, null, 2) + '\n');
    console.log(`${pkg}: ${Object.keys(files).length} baselined file(s) written to ${path.relative(ROOT, baselinePath)}`);
}

function baseRefFiles() {
    const ref = process.env.BASE_REF;
    if (!ref) return null;
    try {
        const raw = execFileSync('git', ['show', `${ref}:${pkg}/.lint-baseline.json`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        return JSON.parse(raw).files;
    } catch {
        return null; // base has no baseline yet: nothing to compare against
    }
}

function check() {
    const files = readFiles();
    const base = baseRefFiles();
    const problems = [];
    for (const [file, recorded] of Object.entries(files)) {
        if (!fs.existsSync(path.join(pkgDir, file))) {
            problems.push(`${file}: listed in the baseline but no longer exists — remove the entry`);
            continue;
        }
        const now = countLines(file);
        if (now > recorded) problems.push(`${file}: grew from ${recorded} to ${now} lines — baselined files may only shrink`);
        if (base && !(file in base)) problems.push(`${file}: newly added to the baseline — the list may only shrink`);
    }
    if (problems.length) {
        console.error(`${pkg} lint baseline ratchet failed:\n  - ${problems.join('\n  - ')}`);
        process.exit(1);
    }
    console.log(`${pkg}: lint baseline OK (${Object.keys(files).length} legacy file(s))`);
}

if (update) writeBaseline();
else check();
