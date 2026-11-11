/**
 * src/http/middleware/requireUser.js — same semantics as the original
 * server.js requireUserId helper.
 */
const { createRequireUserId } = require('../../src/http/middleware/requireUser');

function fakeRes() {
    const res = { statusCode: 200, body: undefined };
    res.status = jest.fn((code) => {
        res.statusCode = code;
        return res;
    });
    res.json = jest.fn((body) => {
        res.body = body;
        return res;
    });
    return res;
}

const req = (authorization) => ({ headers: authorization === undefined ? {} : { authorization } });

test.each([undefined, 'Basic abc', 'bearer lower-case'])(
    'header %p → 401 Missing Authorization header',
    async (header) => {
        const getUser = jest.fn();
        const res = fakeRes();
        expect(await createRequireUserId({ getUser })(req(header), res)).toBeNull();
        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ error: 'Missing Authorization header' });
        expect(getUser).not.toHaveBeenCalled();
    },
);

test('verifies the token after "Bearer " and returns the user id', async () => {
    const getUser = jest.fn(async () => ({ data: { user: { id: 'u1' } }, error: null }));
    const res = fakeRes();
    expect(await createRequireUserId({ getUser })(req('Bearer tok.en'), res)).toBe('u1');
    expect(getUser).toHaveBeenCalledWith('tok.en');
    expect(res.status).not.toHaveBeenCalled();
});

test.each([[{ data: { user: null }, error: null }], [{ data: { user: { id: 'u1' } }, error: { message: 'expired' } }]])(
    'no user or an error → 401 Invalid or expired token',
    async (answer) => {
        const res = fakeRes();
        expect(await createRequireUserId({ getUser: async () => answer })(req('Bearer t'), res)).toBeNull();
        expect(res.statusCode).toBe(401);
        expect(res.body).toEqual({ error: 'Invalid or expired token' });
    },
);

test('a thrown verification error propagates to the route', async () => {
    const getUser = async () => {
        throw new Error('auth down');
    };
    await expect(createRequireUserId({ getUser })(req('Bearer t'), fakeRes())).rejects.toThrow('auth down');
});
