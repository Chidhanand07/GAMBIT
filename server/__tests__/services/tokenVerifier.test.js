/**
 * src/services/tokenVerifier.js — access token → user id [S2] (NODE-10).
 */
const { createTokenVerifier } = require('../../src/services/tokenVerifier');

test('returns the id of the user Supabase Auth resolves the token to', async () => {
    const getUser = jest.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null }));
    expect(await createTokenVerifier({ getUser }).verify('tok')).toBe('user-1');
    expect(getUser).toHaveBeenCalledWith('tok');
});

test.each([
    ['an auth error', { data: { user: null }, error: { message: 'invalid JWT' } }],
    ['no user', { data: { user: null }, error: null }],
    ['an error even with a user present', { data: { user: { id: 'user-1' } }, error: { message: 'expired' } }],
    ['a user without an id', { data: { user: {} }, error: null }],
])('returns null on %s', async (_name, result) => {
    expect(await createTokenVerifier({ getUser: async () => result }).verify('tok')).toBeNull();
});

test('a thrown lookup propagates so the caller can fail closed', async () => {
    const getUser = async () => {
        throw new Error('network');
    };
    await expect(createTokenVerifier({ getUser }).verify('tok')).rejects.toThrow('network');
});
