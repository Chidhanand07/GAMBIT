#!/usr/bin/env node
/**
 * Apply every migration in supabase/migrations to the owner's TEST Supabase project (ADR F-097).
 *
 *   node scripts/test-db/migrate.js            (npm run test-db:migrate in frontend/)
 *   node scripts/test-db/migrate.js --dry-run  print what would be applied
 *
 * Refuses to run unless scripts/test-db/env.js accepts the env files (never production, never
 * local Supabase). Runs `supabase db push --remote=<SUPABASE_TEST_DB_URL> --include-all --yes`:
 * CLI v3 deprecates `--db-url` in favour of `--remote=<url>`; both target the same database.
 * The CLI binary is `SUPABASE_BIN` or `supabase` on PATH (/opt/homebrew/bin/supabase locally).
 */
const { spawnSync } = require('child_process');
const { ROOT, loadTestEnv } = require('./env');

function pushArgs(dbUrl, dryRun) {
    const args = ['db', 'push', `--remote=${dbUrl}`, '--include-all', '--yes', '--workdir', ROOT];
    if (dryRun) args.push('--dry-run');
    return args;
}

function main() {
    let env;
    try {
        env = loadTestEnv();
    } catch (err) {
        console.error(err.message);
        return 1;
    }
    const bin = process.env.SUPABASE_BIN || 'supabase';
    console.log(`Pushing supabase/migrations to the test project ${env.supabaseUrl} ...`);
    const run = spawnSync(bin, pushArgs(env.dbUrl, process.argv.includes('--dry-run')), {
        cwd: ROOT,
        stdio: 'inherit',
        env: { ...process.env, SUPABASE_YES: '1' },
    });
    if (run.error) {
        console.error(`Could not start ${bin}: ${run.error.message}`);
        return 1;
    }
    return run.status ?? 1;
}

if (require.main === module) process.exit(main());

module.exports = { pushArgs };
