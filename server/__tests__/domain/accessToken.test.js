/**
 * domain/accessToken.js — when a (verified) access token stops being valid [TOKEN-LIFETIME].
 */
const { expiryOfToken, socketDeadline, DEFAULT_TOKEN_LIFETIME_MS } = require('../../src/domain/accessToken');

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const jwt = (payload) => `${b64url({ alg: 'ES256' })}.${b64url(payload)}.signature`;
const NOW = 1_700_000_000_000;

describe('expiryOfToken', () => {
    test('the exp claim (seconds) as milliseconds', () => {
        expect(expiryOfToken(jwt({ sub: 'u', exp: 1_700_003_600 }))).toBe(1_700_003_600_000);
    });

    test.each([
        ['not a JWT', 'test-token:alice'],
        ['two parts', 'a.b'],
        ['payload is not base64 JSON', 'a.!!!.c'],
        ['no exp', jwt({ sub: 'u' })],
        ['exp is not a number', jwt({ exp: 'soon' })],
        ['exp is not finite', `${b64url({})}.${Buffer.from('{"exp":1e999}').toString('base64url')}.s`],
        ['a negative exp', jwt({ exp: -5 })],
        ['an empty string', ''],
    ])('%s → null', (_label, token) => expect(expiryOfToken(token)).toBeNull());
});

describe('socketDeadline: when a socket opened with this token must be closed', () => {
    test('the token expiry, when it can be read', () => {
        expect(socketDeadline(jwt({ exp: NOW / 1000 + 900 }), NOW)).toBe(NOW + 900_000);
    });

    test('an unreadable expiry never means "forever": the default access-token lifetime applies', () => {
        expect(DEFAULT_TOKEN_LIFETIME_MS).toBe(3_600_000);
        expect(socketDeadline('opaque-token', NOW)).toBe(NOW + DEFAULT_TOKEN_LIFETIME_MS);
    });

    test('a token that claims a very long life is capped at the default lifetime', () => {
        expect(socketDeadline(jwt({ exp: NOW / 1000 + 86_400 * 365 }), NOW)).toBe(NOW + DEFAULT_TOKEN_LIFETIME_MS);
    });

    test('an already expired token closes the socket immediately', () => {
        expect(socketDeadline(jwt({ exp: NOW / 1000 - 10 }), NOW)).toBe(NOW - 10_000);
    });
});
