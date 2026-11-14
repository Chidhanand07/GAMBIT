/**
 * Unit tests for the lobby hooks (the page-level behaviour is pinned by
 * __tests__/characterization/LobbyPage.characterization.test.tsx).
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Socket } from 'socket.io-client';
import { createFakeSocket, jsonResponse } from '../../characterization/fakeSocket';
import { useActiveGame } from '@/features/lobby/hooks/useActiveGame';
import { queuePayload, useMatchmaking } from '@/features/lobby/hooks/useMatchmaking';
import { usePrivateGame } from '@/features/lobby/hooks/usePrivateGame';
import { useTimeControlSelection } from '@/features/lobby/hooks/useTimeControlSelection';

const fake = createFakeSocket();
const socket = fake as unknown as Socket;
const router = {
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    bfcacheId: 'test',
};
const profile = { id: 'me', username: 'me1' } as never;
let fetchMock: jest.Mock;

beforeEach(() => {
    fake.reset();
    router.push.mockClear();
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;
});
afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});

describe('useTimeControlSelection', () => {
    test('defaults to blitz / 5+0 and keeps getTcMinutes stable until the selection changes', () => {
        const { result, rerender } = renderHook(() => useTimeControlSelection());
        const first = result.current.getTcMinutes;
        expect(result.current.selectedTc).toBe('blitz');
        expect(first()).toEqual({ mins: 3, inc: 0 });
        expect(result.current.playOnlineTimeControl).toBe('3+0');
        rerender();
        expect(result.current.getTcMinutes).toBe(first);
        act(() => result.current.setCustomInc(4));
        expect(result.current.getTcMinutes).not.toBe(first);
        act(() => result.current.setSelectedTc('custom'));
        expect(result.current.playOnlineTimeControl).toBe('5+4');
    });
});

describe('useActiveGame', () => {
    test('stores a game that has an id', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ id: 'g1', time_control: '5' }));
        const { result } = renderHook(() => useActiveGame());
        await waitFor(() => expect(result.current).toEqual({ id: 'g1', time_control: '5' }));
        expect(fetchMock).toHaveBeenCalledWith('/api/games/active');
    });

    test('ignores non-ok responses and network errors', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'g1' }, false));
        const a = renderHook(() => useActiveGame());
        await act(async () => {});
        expect(a.result.current).toBeNull();
        fetchMock.mockRejectedValueOnce(new Error('offline'));
        const b = renderHook(() => useActiveGame());
        await act(async () => {});
        expect(b.result.current).toBeNull();
    });
});

describe('useMatchmaking', () => {
    const terms = { timeControl: '12+5', increment: 5 };
    const payload = { user: { id: 'me' }, time_control: '12+5', increment: 5, is_rated: true };
    const setup = (over: Partial<Parameters<typeof useMatchmaking>[0]> = {}) =>
        renderHook(() => useMatchmaking({ socket, router, profile, onGameStart: jest.fn(), ...over }));
    const refuseNextEmit = (error: string) =>
        fake.emit.mockImplementationOnce((_event: string, _payload: unknown, ack?: (res: unknown) => void) => {
            ack?.({ ok: false, error });
        });

    test('queuePayload is the one join_queue shape; is_rated defaults to true [F8]', () => {
        expect(queuePayload('me', terms)).toEqual(payload);
        expect(queuePayload('me', { ...terms, isRated: false })).toEqual({ ...payload, is_rated: false });
    });

    test('joinQueue emits the payload with an ack and starts the timer; cancelSearch leaves the queue', () => {
        jest.useFakeTimers();
        const { result } = setup();
        act(() => result.current.joinQueue(terms));
        expect(fake.emit.mock.calls).toEqual([['join_queue', payload, expect.any(Function)]]);
        act(() => {
            jest.advanceTimersByTime(3000);
        });
        expect(result.current.searchTime).toBe(3);
        act(() => result.current.cancelSearch());
        expect(fake.emitted('leave_queue')).toEqual(['me']);
        expect(result.current.searching).toBe(false);
        expect(result.current.searchTime).toBe(0);
    });

    test('reconnect while searching re-sends the same payload, with an ack [F8] [TIME-CONTROL]', () => {
        const { result } = setup();
        act(() => result.current.joinQueue({ ...terms, isRated: false }));
        fake.emit.mockClear();
        fake.serverSends('connect');
        expect(fake.emit.mock.calls).toEqual([
            ['join_queue', { ...payload, is_rated: false }, expect.any(Function)],
        ]);
    });

    test('a refused join_queue (first or re-queued) stops the search and reports the code [F8] [ACKS]', () => {
        const onQueueRefused = jest.fn();
        const { result } = setup({ onQueueRefused });
        refuseNextEmit('invalid_time_control');
        act(() => result.current.joinQueue(terms));
        expect(result.current.searching).toBe(false);
        expect(onQueueRefused).toHaveBeenLastCalledWith('invalid_time_control');

        act(() => result.current.joinQueue(terms));
        refuseNextEmit('rate_limited');
        fake.serverSends('connect');
        expect(result.current.searching).toBe(false);
        expect(onQueueRefused).toHaveBeenLastCalledWith('rate_limited');
    });

    test('match_failed stops the search and reports it; nothing navigates [G12]', () => {
        const onMatchFailed = jest.fn();
        const { result } = setup({ onMatchFailed });
        act(() => result.current.joinQueue(terms));
        expect(result.current.searching).toBe(true);

        act(() => fake.serverSends('match_failed', { reason: 'game_creation_failed' }));
        expect(result.current.searching).toBe(false);
        expect(onMatchFailed).toHaveBeenCalledWith('game_creation_failed');
        expect(router.push).not.toHaveBeenCalled();
    });

    test('match_found stops searching and navigates (id, else game_id); game_start calls onGameStart', () => {
        const onGameStart = jest.fn();
        const { result } = setup({ onGameStart });
        act(() => result.current.joinQueue(terms));
        fake.serverSends('match_found', { game_id: 'g2' });
        expect(result.current.searching).toBe(false);
        expect(router.push).toHaveBeenCalledWith('/game/g2');
        fake.serverSends('game_start', { id: 'g3' });
        expect(onGameStart).toHaveBeenCalledTimes(1);
        expect(router.push).toHaveBeenCalledWith('/game/g3');
    });

    test('match_found while not searching is ignored [F8]', () => {
        setup();
        fake.serverSends('match_found', { id: 'stale' });
        expect(router.push).not.toHaveBeenCalled();
    });

    test('listeners are registered once, not again on every state change [F8]', () => {
        const { result } = setup();
        const registrations = fake.on.mock.calls.length;
        act(() => result.current.joinQueue(terms));
        act(() => result.current.cancelSearch());
        expect(fake.on.mock.calls.length).toBe(registrations);
    });

    test('unmount while searching leaves the queue and removes the listeners [F8]', () => {
        const { result, unmount } = setup();
        act(() => result.current.joinQueue(terms));
        fake.emit.mockClear();
        unmount();
        expect(fake.listenedEvents()).toEqual([]);
        expect(fake.emit.mock.calls).toEqual([['leave_queue', 'me']]);
    });

    test('unmount while not searching emits nothing', () => {
        const { unmount } = setup();
        unmount();
        expect(fake.emit).not.toHaveBeenCalled();
    });

    test('registers nothing without a socket', () => {
        renderHook(() => useMatchmaking({ socket: null, router, profile, onGameStart: jest.fn() }));
        expect(fake.on).not.toHaveBeenCalled();
    });
});

describe('usePrivateGame', () => {
    const setup = () => renderHook(() => usePrivateGame({ socket, customMin: 7, customInc: 2 }));

    test('createInvite POSTs the options, shows the link and joins the room', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ token: 'tok', game_id: 'g9' }));
        const { result } = setup();
        act(() => result.current.setPrivateTc('custom'));
        act(() => result.current.setPrivateColor('white'));
        act(() => result.current.toggleRated());
        await act(async () => {
            await result.current.createInvite();
        });
        expect(fetchMock).toHaveBeenCalledWith('/api/games/private/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timeControl: '7+2', color: 'white', isRated: true }),
        });
        expect(result.current.inviteState).toBe('share');
        expect(result.current.inviteLink).toBe('http://localhost/join/tok');
        expect(result.current.inviteGameId).toBe('g9');
        expect(fake.emitted('join_game')).toEqual(['g9']);
    });

    test('a body without a token returns to config without logging; a throw returns silently [S14]', async () => {
        const err = jest.spyOn(console, 'error').mockImplementation(() => {});
        fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'nope' }));
        const { result } = setup();
        await act(async () => {
            await result.current.createInvite();
        });
        expect(err).not.toHaveBeenCalled();
        expect(result.current.inviteState).toBe('config');
        fetchMock.mockRejectedValueOnce(new Error('offline'));
        await act(async () => {
            await result.current.createInvite();
        });
        expect(result.current.inviteState).toBe('config');
        expect(err).not.toHaveBeenCalled();
    });

    test('copyInviteLink flags justCopied for 2 s', async () => {
        jest.useFakeTimers();
        const writeText = jest.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
        const { result } = setup();
        await act(async () => {
            await result.current.copyInviteLink();
        });
        expect(writeText).toHaveBeenCalledWith('');
        expect(result.current.justCopied).toBe(true);
        act(() => {
            jest.advanceTimersByTime(2000);
        });
        expect(result.current.justCopied).toBe(false);
    });
});
