import { act, renderHook } from '@testing-library/react';
import { useProfileTab } from '@/features/profile/hooks/useProfileTab';
import { useGameHistory } from '@/features/profile/hooks/useGameHistory';
import { useFriends } from '@/features/profile/hooks/useFriends';
import type { Profile } from '@/types/profile';

const ok = (body: unknown) => ({ ok: true, json: async () => body });
const fail = () => ({ ok: false, json: async () => ({}) });
let fetchMock: jest.Mock;
let routes: Record<string, unknown>;
beforeEach(() => {
    routes = {};
    fetchMock = jest.fn(async (url: string) => (url in routes ? ok(routes[url]) : fail()));
    (global as unknown as { fetch: jest.Mock }).fetch = fetchMock;
    window.history.replaceState(null, '', '/');
});
const flush = async () => {
    for (let i = 0; i < 5; i++) await act(async () => {});
};
const PROFILE = { id: 'u-1', username: 'bob' } as Profile;

describe('useProfileTab', () => {
    test.each(['overview', 'games', 'stats', 'friends'])('#%s selects that tab on mount', (tab) => {
        window.history.replaceState(null, '', `/profile/bob#${tab}`);
        const { result } = renderHook(() => useProfileTab());
        expect(result.current.activeTab).toBe(tab);
    });
    test('unknown hash keeps overview', () => {
        window.history.replaceState(null, '', '/profile/bob#nope');
        const { result } = renderHook(() => useProfileTab());
        expect(result.current.activeTab).toBe('overview');
    });
});

describe('useGameHistory', () => {
    const page = (n: number, prefix: string) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}` }));

    test('does nothing until the games tab is active with a profile', async () => {
        renderHook(() => useGameHistory({ username: 'bob', activeTab: 'overview', profile: PROFILE }));
        renderHook(() => useGameHistory({ username: 'bob', activeTab: 'games', profile: null }));
        await flush();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    test('loads the first page, then appends by offset until a short page', async () => {
        routes['/api/profile/bob/games?limit=15&offset=0'] = { games: page(15, 'a') };
        routes['/api/profile/bob/games?limit=15&offset=15'] = { games: page(2, 'b') };
        const { result } = renderHook(() => useGameHistory({ username: 'bob', activeTab: 'games', profile: PROFILE }));
        await flush();
        expect(result.current.games).toHaveLength(15);
        expect(result.current.hasMoreGames).toBe(true);
        await act(async () => {
            await result.current.loadMore();
        });
        expect(result.current.games).toHaveLength(17);
        expect(result.current.hasMoreGames).toBe(false);
    });

    test('does not refetch when re-rendered with the same tab and profile id', async () => {
        routes['/api/profile/bob/games?limit=15&offset=0'] = { games: [] };
        const { rerender } = renderHook(
            ({ profile }) => useGameHistory({ username: 'bob', activeTab: 'games', profile }),
            { initialProps: { profile: PROFILE } },
        );
        await flush();
        rerender({ profile: { ...PROFILE } });
        await flush();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

describe('useFriends', () => {
    test('accepting moves the requester into the list with its friendship id', async () => {
        routes['/api/friends?userId=u-1'] = [];
        routes['/api/friends/pending'] = [{ id: 'f-1', requester: { username: 'carol' } }];
        const { result } = renderHook(() => useFriends({ activeTab: 'friends', profile: PROFILE, isOwnProfile: true }));
        await flush();
        expect(result.current.pendingRequests).toHaveLength(1);
        await act(async () => {
            await result.current.respondToRequest('f-1', 'accept');
        });
        expect(fetchMock).toHaveBeenLastCalledWith('/api/friends/f-1?action=accept', { method: 'PUT' });
        expect(result.current.pendingRequests).toEqual([]);
        expect(result.current.friends).toEqual([{ username: 'carol', friendship_id: 'f-1' }]);
    });

    test('other profiles do not load pending requests', async () => {
        routes['/api/friends?userId=u-1'] = [];
        renderHook(() => useFriends({ activeTab: 'friends', profile: PROFILE, isOwnProfile: false }));
        await flush();
        expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['/api/friends?userId=u-1']);
    });
});
