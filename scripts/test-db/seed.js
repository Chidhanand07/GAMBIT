#!/usr/bin/env node
/**
 * Seed the owner's TEST Supabase project for the parity harness (ADR F-098).
 *
 *   node scripts/test-db/seed.js      (npm run test-db:seed in frontend/)
 *
 * Refuses to run unless scripts/test-db/env.js accepts the env files. Idempotent:
 *   - accounts are created through the Auth admin API, or have their password reset to the one
 *     stored in the git-ignored frontend/e2e/.auth/accounts.json (generated on first run);
 *   - every row has a fixed id or natural key and is inserted with ON CONFLICT DO NOTHING
 *     (service_role has no UPDATE on profiles: migration 20261114200000), so a second run changes nothing.
 * Uses @supabase/supabase-js and chess.js from frontend/node_modules (run `npm ci` there first).
 */
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const { ROOT, loadTestEnv } = require('./env');
const data = require('./seed-data');

const ACCOUNTS_FILE = path.join(ROOT, 'frontend', 'e2e', '.auth', 'accounts.json');
const USERS_PAGE_SIZE = 1000;
const frontendRequire = createRequire(path.join(ROOT, 'frontend', 'package.json'));

function readAccounts() {
    if (!fs.existsSync(ACCOUNTS_FILE)) return {};
    return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
}

function writeAccounts(accounts) {
    fs.mkdirSync(path.dirname(ACCOUNTS_FILE), { recursive: true });
    fs.writeFileSync(ACCOUNTS_FILE, `${JSON.stringify(accounts, null, 2)}\n`, { mode: 0o600 });
}

/** chess.js replay of a SAN line: per-ply UCI and FEN, the final FEN and a PGN. */
function replay(sans) {
    const { Chess } = frontendRequire('chess.js');
    const chess = new Chess();
    const plies = sans.map((san) => {
        const move = chess.move(san);
        return { san: move.san, uci: `${move.from}${move.to}${move.promotion ?? ''}`, fen: chess.fen() };
    });
    return { plies, finalFen: chess.fen(), pgn: chess.pgn() };
}

async function existingUsersByEmail(admin) {
    const byEmail = new Map();
    for (let page = 1; ; page += 1) {
        const { data: res, error } = await admin.auth.admin.listUsers({ page, perPage: USERS_PAGE_SIZE });
        if (error) throw new Error(`listUsers failed: ${error.message}`);
        res.users.forEach((u) => byEmail.set((u.email || '').toLowerCase(), u.id));
        if (res.users.length < USERS_PAGE_SIZE) return byEmail;
    }
}

async function ensureUser(admin, existing, account, password) {
    const email = data.emailFor(account);
    const id = existing.get(email);
    if (id) {
        const { error } = await admin.auth.admin.updateUserById(id, { password });
        if (error) throw new Error(`reset password for ${email} failed: ${error.message}`);
        return id;
    }
    const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { username: account.username },
    });
    if (error) throw new Error(`create ${email} failed: ${error.message}`);
    return created.user.id;
}

async function insertIgnoringDuplicates(admin, table, rows, onConflict) {
    if (rows.length === 0) return;
    const { error } = await admin.from(table).upsert(rows, { onConflict, ignoreDuplicates: true });
    if (error) throw new Error(`insert into ${table} failed: ${error.message}`);
}

async function seed(env) {
    const { createClient } = frontendRequire('@supabase/supabase-js');
    const admin = createClient(env.supabaseUrl, env.server.SUPABASE_SECRET_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const stored = readAccounts();
    const existing = await existingUsersByEmail(admin);
    const ids = {};
    for (const account of data.ACCOUNTS) {
        const password = stored[account.role]?.password || data.generatePassword();
        ids[account.role] = await ensureUser(admin, existing, account, password);
        stored[account.role] = { email: data.emailFor(account), username: account.username, password };
    }
    writeAccounts(stored);

    const now = Date.now();
    const records = data.recordsByRole();
    const profiles = data.ACCOUNTS.map((a) => data.profileRow(a, ids[a.role], records[a.role], now));
    await insertIgnoringDuplicates(admin, 'profiles', profiles, 'id');
    const { games, moves } = data.gameRows(ids, replay, now);
    await insertIgnoringDuplicates(admin, 'games', games, 'id');
    await insertIgnoringDuplicates(admin, 'moves', moves, 'id');
    await insertIgnoringDuplicates(admin, 'friendships', data.friendshipRows(ids), 'requester_id,addressee_id');
    await insertIgnoringDuplicates(admin, 'notifications', data.notificationRows(ids, now), 'id');
    return { accounts: data.ACCOUNTS.length, games: games.length, moves: moves.length };
}

async function main() {
    let env;
    try {
        env = loadTestEnv();
    } catch (err) {
        console.error(err.message);
        return 1;
    }
    console.log(`Seeding the test project ${env.supabaseUrl} ...`);
    const summary = await seed(env);
    console.log(`Seeded ${summary.accounts} accounts, ${summary.games} games, ${summary.moves} moves.`);
    console.log(`Credentials: ${path.relative(ROOT, ACCOUNTS_FILE)} (git-ignored).`);
    return 0;
}

if (require.main === module) {
    main().then(
        (code) => process.exit(code),
        (err) => {
            console.error(err.message);
            process.exit(1);
        },
    );
}

module.exports = { replay, ACCOUNTS_FILE };
