/**
 * src/domain/spectators.js: members and the "N watching" count [F-130].
 */
const { spectatorMember, watcherCount, SPECTATOR_HEARTBEAT_MS, SPECTATOR_TTL_MS } = require('../../src/domain/spectators');

test('a member is the viewer and the socket', () => {
    expect(spectatorMember('u1', 'sockA')).toBe('u1:sockA');
});

test('counts distinct viewers: two tabs of one viewer count once', () => {
    expect(watcherCount([])).toBe(0);
    expect(watcherCount(['u1:a', 'u2:b'])).toBe(2);
    expect(watcherCount(['u1:a', 'u1:b', 'u2:c'])).toBe(2);
});

test('a socket id with dashes and underscores does not split the viewer', () => {
    expect(watcherCount(['u1:a-b_c', 'u1:d-e'])).toBe(1);
});

test('a heartbeat refreshes well within the TTL (two missed beats still keep a member)', () => {
    expect(SPECTATOR_HEARTBEAT_MS * 2).toBeLessThan(SPECTATOR_TTL_MS);
});
