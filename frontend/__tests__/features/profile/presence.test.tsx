/**
 * F11: the profile's Online badge must read the same presence set that every
 * signed-in tab tracks itself into (PresenceProvider's `gambit-online-users`).
 *
 * The Supabase double mirrors realtime-js: presence state is per topic, and
 * `channel(topic)` returns the existing channel for a topic that is already open.
 */
import { act, render, screen } from '@testing-library/react';

type Handler = () => void;
interface FakeChannel {
    topic: string;
    handlers: Record<string, Handler[]>;
    on: jest.Mock;
    subscribe: jest.Mock;
    track: jest.Mock;
    untrack: jest.Mock;
    presenceState: () => Record<string, unknown>;
}
const presenceByTopic: Record<string, Record<string, unknown>> = {};
const openChannels = new Map<string, FakeChannel>();

function makeChannel(topic: string): FakeChannel {
    const ch: FakeChannel = {
        topic,
        handlers: {},
        on: jest.fn((_type: string, filter: { event: string }, cb: Handler) => {
            (ch.handlers[filter.event] ??= []).push(cb);
            return ch;
        }),
        subscribe: jest.fn(() => ch),
        track: jest.fn(async () => {}),
        untrack: jest.fn(async () => {}),
        presenceState: () => presenceByTopic[topic] ?? {},
    };
    return ch;
}
const supabase = {
    channel: jest.fn((topic: string) => {
        const existing = openChannels.get(topic);
        if (existing) return existing;
        const ch = makeChannel(topic);
        openChannels.set(topic, ch);
        return ch;
    }),
    removeChannel: jest.fn(async (ch: FakeChannel) => {
        openChannels.delete(ch.topic);
    }),
};
jest.mock('@/lib/supabase/client', () => ({ createClient: () => supabase }));

let viewer: { id: string; username: string } | null = { id: 'u-me', username: 'me' };
jest.mock('@/components/ProfileProvider', () => ({ useProfile: () => ({ profile: viewer }) }));

import PresenceProvider from '@/components/PresenceProvider';
import { useProfilePresence } from '@/features/profile/hooks/useProfilePresence';

const ONLINE_TOPIC = 'gambit-online-users';

function Badge({ id }: { id: string }) {
    return <div data-testid="badge">{useProfilePresence(id) ? 'Online' : 'Offline'}</div>;
}

/** Every open channel on the topic receives the sync, as realtime-js broadcasts it. */
function syncTopic(topic: string, state: Record<string, unknown>) {
    presenceByTopic[topic] = state;
    act(() => {
        for (const ch of openChannels.values()) {
            if (ch.topic === topic) ch.handlers.sync?.forEach((h) => h());
        }
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    openChannels.clear();
    for (const k of Object.keys(presenceByTopic)) delete presenceByTopic[k];
    viewer = { id: 'u-me', username: 'me' };
});

describe('useProfilePresence (F11)', () => {
    test('shows Online when the profile owner is in the shared presence set', () => {
        render(
            <PresenceProvider>
                <Badge id="u-bob" />
            </PresenceProvider>,
        );
        expect(screen.getByTestId('badge')).toHaveTextContent('Offline');
        syncTopic(ONLINE_TOPIC, { 'u-me': [{}], 'u-bob': [{}] });
        expect(screen.getByTestId('badge')).toHaveTextContent('Online');
        syncTopic(ONLINE_TOPIC, { 'u-me': [{}] });
        expect(screen.getByTestId('badge')).toHaveTextContent('Offline');
    });

    test('opens no extra channel and never removes the shared one', () => {
        const { unmount } = render(
            <PresenceProvider>
                <Badge id="u-bob" />
            </PresenceProvider>,
        );
        expect(supabase.channel.mock.calls.map((c) => c[0])).toEqual([ONLINE_TOPIC]);
        unmount();
        expect(supabase.channel).toHaveBeenCalledTimes(1);
    });

    test('a signed-out viewer has no presence data, so the badge stays hidden', () => {
        viewer = null;
        render(
            <PresenceProvider>
                <Badge id="u-bob" />
            </PresenceProvider>,
        );
        expect(supabase.channel).not.toHaveBeenCalled();
        expect(screen.getByTestId('badge')).toHaveTextContent('Offline');
    });
});
