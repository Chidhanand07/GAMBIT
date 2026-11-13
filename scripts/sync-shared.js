#!/usr/bin/env node
// Copies the shared definitions in shared/ into each deployable package.
//
// The game server (Railway, root `server/`) and the web app (Vercel, root `frontend/`) are
// built from their own directories and cannot import a file above them, so each carries a
// copy. `shared/` is the only place to edit; tests in both packages fail when a copy differs.
//
//   node scripts/sync-shared.js           write the copies
//   node scripts/sync-shared.js --check   exit 1 if a copy is out of date
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

/** [source under shared/, copies] */
const FILES = [
    [
        'time-control.json',
        ['server/src/domain/timeControl.data.json', 'frontend/lib/chess/timeControl.data.json'],
    ],
];

const check = process.argv.includes('--check');
let stale = 0;

for (const [source, copies] of FILES) {
    const content = fs.readFileSync(path.join(root, 'shared', source), 'utf8');
    for (const copy of copies) {
        const target = path.join(root, copy);
        const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
        if (current === content) continue;
        if (check) {
            console.error(`out of date: ${copy} (run node scripts/sync-shared.js)`);
            stale += 1;
        } else {
            fs.writeFileSync(target, content);
            console.log(`wrote ${copy}`);
        }
    }
}

process.exit(stale ? 1 : 0);
