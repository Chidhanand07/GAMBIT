/**
 * The TEST project's seed data (ADR F-098): accounts, finished games, friendships and
 * notifications. Pure data and pure builders, no I/O, so it is unit-tested and the seed runner
 * stays small. Everything is obviously test data: `parity_` usernames, a reserved `.test` e-mail
 * domain (RFC 2606) and fixed UUIDs in the `7a1e…` range, so re-running the seed is idempotent.
 */
const crypto = require('crypto');

/** RFC 2606 reserved TLD: no mail is ever delivered. */
const EMAIL_DOMAIN = 'gambit-parity.test';
const DAY_MS = 24 * 60 * 60 * 1000;
const PASSWORD_BYTES = 24;

/** `role` is how the harness refers to an account (storageState file names, fixtures). */
const ACCOUNTS = Object.freeze([
    { role: 'white', username: 'parity_white', displayName: 'Parity White', country: 'India', bio: 'Parity test account (white).', ratings: [1412, 1487, 1523, 1450] },
    { role: 'black', username: 'parity_black', displayName: 'Parity Black', country: 'India', bio: 'Parity test account (black).', ratings: [1388, 1462, 1498, 1431] },
    { role: 'viewer', username: 'parity_viewer', displayName: 'Parity Viewer', country: 'India', bio: 'Parity test account (viewer).', ratings: [1301, 1344, 1365, 1320] },
    { role: 'rival1', username: 'parity_rival_1', displayName: 'Parity Rival 1', country: '', bio: '', ratings: [1550, 1602, 1611, 1580] },
    { role: 'rival2', username: 'parity_rival_2', displayName: 'Parity Rival 2', country: '', bio: '', ratings: [1275, 1290, 1312, 1300] },
    { role: 'rival3', username: 'parity_rival_3', displayName: 'Parity Rival 3', country: '', bio: '', ratings: [1199, 1233, 1254, 1240] },
]);

/** Short, legal openings (SAN); the runner replays them with chess.js for UCI and FEN. */
const LINES = Object.freeze({
    kingsGambit: ['e4', 'e5', 'f4', 'exf4', 'Nf3', 'g5', 'h4', 'g4', 'Ne5', 'Nf6'],
    italian: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd4', 'exd4'],
    sicilian: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'],
    queensGambit: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e3', 'O-O'],
    scholars: ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#'],
});

/** [white role, black role, time control, outcome ('white'|'black'|'draw'), line, days ago]. */
const GAMES = Object.freeze([
    ['white', 'black', '3+0', 'white', 'kingsGambit', 1],
    ['black', 'white', '3+0', 'white', 'italian', 2],
    ['white', 'rival1', '10+0', 'black', 'sicilian', 3],
    ['viewer', 'white', '1+0', 'black', 'sicilian', 4],
    ['white', 'rival2', '3+2', 'draw', 'queensGambit', 5],
    ['rival3', 'white', '10+0', 'black', 'italian', 6],
    ['white', 'black', '30+0', 'white', 'scholars', 7],
    ['black', 'rival1', '3+0', 'black', 'kingsGambit', 8],
    ['rival2', 'black', '1+0', 'white', 'sicilian', 9],
    ['viewer', 'rival3', '10+0', 'draw', 'queensGambit', 10],
]);

const pad = (n, width) => String(n).padStart(width, '0');
/** Fixed ids: games 7a1e0000-…-0000000000NN, moves 7a1e0001-…-GGGGPPPPPPPP. */
const gameId = (index) => `7a1e0000-0000-4000-8000-${pad(index + 1, 12)}`;
const moveId = (gameIndex, ply) => `7a1e0001-0000-4000-8000-${pad(gameIndex + 1, 4)}${pad(ply, 8)}`;
const notificationId = (index) => `7a1e0002-0000-4000-8000-${pad(index + 1, 12)}`;

const emailFor = (account) => `${account.username.replace(/_/g, '-')}@${EMAIL_DOMAIN}`;
const generatePassword = () => crypto.randomBytes(PASSWORD_BYTES).toString('base64url');

/** wins/losses/draws per role from GAMES, so profile counters agree with the game rows. */
function recordsByRole() {
    const records = Object.fromEntries(ACCOUNTS.map((a) => [a.role, { games_played: 0, wins: 0, losses: 0, draws: 0 }]));
    for (const [white, black, , outcome] of GAMES) {
        for (const [role, colour] of [[white, 'white'], [black, 'black']]) {
            const r = records[role];
            r.games_played += 1;
            if (outcome === 'draw') r.draws += 1;
            else if (outcome === colour) r.wins += 1;
            else r.losses += 1;
        }
    }
    return records;
}

function profileRow(account, userId, record, now) {
    const [bullet, blitz, rapid, classical] = account.ratings;
    return {
        id: userId,
        username: account.username,
        display_name: account.displayName,
        bio: account.bio || null,
        country: account.country || null,
        rating_bullet: bullet,
        rating_blitz: blitz,
        rating_rapid: rapid,
        rating_classical: classical,
        ...record,
        created_at: new Date(now - 30 * DAY_MS).toISOString(),
    };
}

/**
 * Game and move rows. `ids` maps role → auth user id; `replay(sans)` returns
 * [{ san, uci, fen }] and the final FEN (chess.js, injected so this module stays pure).
 */
function gameRows(ids, replay, now) {
    const games = [];
    const moves = [];
    GAMES.forEach(([white, black, tc, outcome, line, daysAgo], index) => {
        const { plies, finalFen, pgn } = replay(LINES[line]);
        const endedAt = new Date(now - daysAgo * DAY_MS);
        const startedAt = new Date(endedAt.getTime() - 10 * 60 * 1000);
        const [minutes] = tc.split('+').map(Number);
        games.push({
            id: gameId(index),
            white_id: ids[white],
            black_id: ids[black],
            time_control: tc,
            status: 'completed',
            result: outcome,
            winner_id: outcome === 'draw' ? null : ids[outcome === 'white' ? white : black],
            pgn,
            final_fen: finalFen,
            white_clock_ms: minutes * 60 * 1000 - 41000,
            black_clock_ms: minutes * 60 * 1000 - 52000,
            is_rated: true,
            started_at: startedAt.toISOString(),
            ended_at: endedAt.toISOString(),
            rated_at: endedAt.toISOString(),
            created_at: startedAt.toISOString(),
        });
        plies.forEach((p, ply) => {
            moves.push({
                id: moveId(index, ply + 1),
                game_id: gameId(index),
                move_number: Math.floor(ply / 2) + 1,
                color: ply % 2 === 0 ? 'white' : 'black',
                uci: p.uci,
                san: p.san,
                fen_after: p.fen,
                created_at: new Date(startedAt.getTime() + (ply + 1) * 5000).toISOString(),
            });
        });
    });
    return { games, moves };
}

function friendshipRows(ids) {
    return [
        { requester_id: ids.white, addressee_id: ids.black, status: 'accepted' },
        { requester_id: ids.viewer, addressee_id: ids.white, status: 'accepted' },
        { requester_id: ids.white, addressee_id: ids.rival2, status: 'accepted' },
        { requester_id: ids.rival1, addressee_id: ids.white, status: 'pending' },
    ];
}

function notificationRows(ids, now) {
    const at = (minutes) => new Date(now - minutes * 60 * 1000).toISOString();
    return [
        { id: notificationId(0), user_id: ids.white, type: 'friend_request', read: false, created_at: at(12), payload: { message: 'parity_rival_1 sent you a friend request', from_username: 'parity_rival_1' } },
        { id: notificationId(1), user_id: ids.white, type: 'challenge', read: false, created_at: at(45), payload: { message: 'parity_black challenged you', from_username: 'parity_black', time_control: '3+0' } },
        { id: notificationId(2), user_id: ids.white, type: 'game_result', read: true, created_at: at(60 * 26), payload: { message: 'You won against parity_black' } },
        { id: notificationId(3), user_id: ids.black, type: 'game_result', read: false, created_at: at(60 * 26), payload: { message: 'You lost against parity_white' } },
    ];
}

module.exports = {
    EMAIL_DOMAIN,
    ACCOUNTS,
    GAMES,
    LINES,
    gameId,
    moveId,
    emailFor,
    generatePassword,
    recordsByRole,
    profileRow,
    gameRows,
    friendshipRows,
    notificationRows,
};
