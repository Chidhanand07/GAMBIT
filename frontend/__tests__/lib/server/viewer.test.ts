/** lib/server/viewer.ts: the landing's viewer from the verified session (F-112). */
const getVerifiedUserId = jest.fn();
jest.mock('@/lib/server/identity', () => ({ getVerifiedUserId: () => getVerifiedUserId() }));

const maybeSingle = jest.fn();
interface Query { select: jest.Mock; eq: jest.Mock; maybeSingle: () => unknown }
const query: Query = { select: jest.fn((): Query => query), eq: jest.fn((): Query => query), maybeSingle: () => maybeSingle() };
const from = jest.fn(() => query);
jest.mock('@/lib/server/supabase', () => ({ createUserClient: async () => ({ from }) }));

import { getViewer, toViewerProfile } from '@/lib/server/viewer';

const ROW = { id: 'u1', username: 'alice', display_name: 'Alice', avatar_url: null, rating_rapid: 1499.6, email: 'x@y.z' };

beforeEach(() => jest.clearAllMocks());

describe('getViewer', () => {
    test('no verified session: a guest, and the database is never asked', async () => {
        getVerifiedUserId.mockResolvedValue(null);
        expect(await getViewer()).toEqual({ status: 'guest' });
        expect(from).not.toHaveBeenCalled();
    });

    test("verified: reads only the viewer's own row, as that user, and returns an allow-listed DTO", async () => {
        getVerifiedUserId.mockResolvedValue('u1');
        maybeSingle.mockResolvedValue({ data: ROW, error: null });
        expect(await getViewer()).toEqual({
            status: 'signed-in',
            profile: { id: 'u1', username: 'alice', display_name: 'Alice', avatar_url: null, rating_rapid: 1499.6 },
        });
        expect(from).toHaveBeenCalledWith('profiles');
        expect(query.select).toHaveBeenCalledWith('id, username, display_name, avatar_url, rating_rapid');
        expect(query.eq).toHaveBeenCalledWith('id', 'u1');
    });

    test('verified but the profile is missing, errors or throws: unknown (never a guest)', async () => {
        getVerifiedUserId.mockResolvedValue('u1');
        maybeSingle.mockResolvedValueOnce({ data: null, error: null });
        expect(await getViewer()).toEqual({ status: 'unknown' });
        maybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'denied' } });
        expect(await getViewer()).toEqual({ status: 'unknown' });
        const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
        maybeSingle.mockRejectedValueOnce(new Error('network'));
        expect(await getViewer()).toEqual({ status: 'unknown' });
        errorLog.mockRestore();
    });
});

test('toViewerProfile rejects rows without an id or username and drops unknown types', () => {
    expect(toViewerProfile(null)).toBeNull();
    expect(toViewerProfile({ id: 'u1' })).toBeNull();
    expect(toViewerProfile({ id: 'u1', username: 'a', display_name: 7, rating_rapid: '1500' })).toEqual({
        id: 'u1', username: 'a', display_name: null, avatar_url: null, rating_rapid: null,
    });
});
