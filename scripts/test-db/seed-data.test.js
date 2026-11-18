'use strict';

// Run with: node --test scripts/test-db/*.test.js   (Node built-ins only)

const assert = require('node:assert/strict');
const { test } = require('node:test');
const data = require('./seed-data');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/;
const ids = Object.fromEntries(data.ACCOUNTS.map((a, i) => [a.role, `user-${i}`]));
const fakeReplay = (sans) => ({
    plies: sans.map((san, i) => ({ san, uci: `u${i}`, fen: `f${i}` })),
    finalFen: 'final',
    pgn: sans.join(' '),
});

test('accounts use the reserved test domain and parity_ usernames', () => {
    for (const account of data.ACCOUNTS) {
        assert.match(account.username, /^parity_[a-z0-9_]+$/);
        assert.ok(data.emailFor(account).endsWith('@gambit-parity.test'));
    }
    assert.deepEqual(data.ACCOUNTS.slice(0, 3).map((a) => a.role), ['white', 'black', 'viewer']);
});

test('generated passwords are long and never repeat', () => {
    const a = data.generatePassword();
    assert.ok(a.length >= 32);
    assert.notEqual(a, data.generatePassword());
});

test('profile counters agree with the seeded games', () => {
    const records = data.recordsByRole();
    const total = Object.values(records).reduce((n, r) => n + r.games_played, 0);
    assert.equal(total, data.GAMES.length * 2);
    for (const r of Object.values(records)) assert.equal(r.wins + r.losses + r.draws, r.games_played);
});

test('game rows have fixed UUIDs, a winner that matches the result and one move row per ply', () => {
    const { games, moves } = data.gameRows(ids, fakeReplay, Date.UTC(2026, 10, 18));
    assert.equal(new Set(games.map((g) => g.id)).size, games.length);
    assert.equal(new Set(moves.map((m) => m.id)).size, moves.length);
    for (const g of games) {
        assert.match(g.id, UUID);
        assert.ok(['white', 'black', 'draw'].includes(g.result));
        const expected = g.result === 'draw' ? null : g.result === 'white' ? g.white_id : g.black_id;
        assert.equal(g.winner_id, expected);
        assert.equal(g.status, 'completed');
    }
    moves.forEach((m) => assert.match(m.id, UUID));
    const plies = data.GAMES.reduce((n, [, , , , line]) => n + data.LINES[line].length, 0);
    assert.equal(moves.length, plies);
});

test('a mating line is only ever a win for the side that mates', () => {
    for (const [, , , outcome, line] of data.GAMES) {
        const sans = data.LINES[line];
        if (!sans[sans.length - 1].endsWith('#')) continue;
        assert.equal(outcome, sans.length % 2 === 1 ? 'white' : 'black');
    }
});

test('the viewer sees unread notifications and accepted friends for white', () => {
    const notes = data.notificationRows(ids, Date.now());
    assert.ok(notes.some((n) => n.user_id === ids.white && !n.read));
    const friends = data.friendshipRows(ids).filter((f) => f.status === 'accepted');
    assert.ok(friends.length >= 2);
});
