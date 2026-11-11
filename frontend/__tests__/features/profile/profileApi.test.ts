import * as api from '@/lib/api/profile';

let fetchMock: jest.Mock;
beforeEach(() => {
    fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({}) }));
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
});
const lastCall = () => fetchMock.mock.calls[fetchMock.mock.calls.length - 1];

test.each<[string, () => Promise<unknown>, unknown[]]>([
    ['fetchProfile', () => api.fetchProfile('bob smith'), ['/api/profile/bob%20smith', { cache: 'no-store' }]],
    ['fetchMyProfile', () => api.fetchMyProfile(), ['/api/profile/me', { cache: 'no-store' }]],
    [
        'fetchRecentGames',
        () => api.fetchRecentGames('bob smith'),
        ['/api/profile/bob%20smith/games?limit=5&offset=0', { cache: 'no-store' }],
    ],
    [
        'fetchProfileGamesPage (LEGACY: not encoded)',
        () => api.fetchProfileGamesPage('bob smith', 15, 30),
        ['/api/profile/bob smith/games?limit=15&offset=30', { cache: 'no-store' }],
    ],
    ['fetchProfileStats', () => api.fetchProfileStats('a/b'), ['/api/profile/a%2Fb/stats', { cache: 'no-store' }]],
    ['fetchFriendStatus', () => api.fetchFriendStatus('bob smith'), ['/api/friends/status/bob%20smith']],
    ['fetchFriendsOf', () => api.fetchFriendsOf('u-1'), ['/api/friends?userId=u-1']],
    ['fetchPendingFriendRequests', () => api.fetchPendingFriendRequests(), ['/api/friends/pending']],
    [
        'sendFriendRequest',
        () => api.sendFriendRequest('bob'),
        [
            '/api/friends/request',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ addressee_username: 'bob' }),
            },
        ],
    ],
    [
        'respondToFriendRequest',
        () => api.respondToFriendRequest('f-1', 'decline'),
        ['/api/friends/f-1?action=decline', { method: 'PUT' }],
    ],
])('%s calls fetch with the legacy url/options', async (_name, call, expected) => {
    await call();
    expect(lastCall()).toEqual(expected);
});

test('no-store options are a fresh object per call', async () => {
    await api.fetchMyProfile();
    await api.fetchMyProfile();
    const [a, b] = fetchMock.mock.calls.map((c) => c[1]);
    expect(a).not.toBe(b);
});
