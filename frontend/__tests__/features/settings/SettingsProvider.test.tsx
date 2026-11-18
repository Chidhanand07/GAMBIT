import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

const setSoundsEnabled = jest.fn();
const playPreviewMoveSound = jest.fn();
jest.mock('@/lib/sounds', () => ({
    setSoundsEnabled: (on: boolean) => setSoundsEnabled(on),
    playPreviewMoveSound: () => playPreviewMoveSound(),
}));

import { BoardPreview } from '@/features/settings/components/BoardPreview';
import { useSettingsDraft } from '@/features/settings/hooks/useSettingsDraft';
import { DEFAULT_SETTINGS, type UserSettings } from '@/features/settings/model';
import { SettingsProvider, useBoardPrefs, useUserSettings } from '@/features/settings/SettingsProvider';
import type { SettingsStore } from '@/features/settings/store';

function memoryStore(initial: UserSettings = DEFAULT_SETTINGS): SettingsStore & { saved: UserSettings[] } {
    let current = initial;
    const saved: UserSettings[] = [];
    return {
        saved,
        load: () => current,
        save: (s) => {
            current = s;
            saved.push(s);
        },
    };
}

const wrap = (store: SettingsStore) =>
    function Wrapper({ children }: { children: ReactNode }) {
        return <SettingsProvider store={store}>{children}</SettingsProvider>;
    };

beforeEach(() => {
    setSoundsEnabled.mockClear();
    playPreviewMoveSound.mockClear();
});

describe('SettingsProvider', () => {
    test('loads the stored settings after mount and applies sound and slide speed app-wide', () => {
        const store = memoryStore({
            ...DEFAULT_SETTINGS,
            boardTheme: 'slate',
            showCoordinates: true,
            moveSounds: false,
            pieceAnimation: 'fast',
        });
        const { result } = renderHook(() => useBoardPrefs(), { wrapper: wrap(store) });
        expect(result.current).toMatchObject({ theme: 'slate', animate: true, showCoordinates: true, sound: false });
        expect(setSoundsEnabled).toHaveBeenLastCalledWith(false);
        expect(document.documentElement.style.getPropertyValue('--piece-slide-duration')).toBe('150ms');
    });

    test('save persists through the store and updates every consumer', () => {
        const store = memoryStore();
        const { result } = renderHook(() => ({ ctx: useUserSettings(), prefs: useBoardPrefs() }), {
            wrapper: wrap(store),
        });
        act(() => result.current.ctx.save({ ...DEFAULT_SETTINGS, boardTheme: 'green', pieceAnimation: 'off' }));
        expect(store.saved).toHaveLength(1);
        expect(result.current.prefs).toMatchObject({ theme: 'green', animate: false });
        expect(document.documentElement.style.getPropertyValue('--piece-slide-duration')).toBe('0ms');
    });

    test('without a provider the defaults are used', () => {
        const { result } = renderHook(() => useBoardPrefs());
        expect(result.current.theme).toBe('maple');
    });
});

describe('useSettingsDraft', () => {
    test('edits stay in the draft until Save; Reset restores the defaults into the draft', () => {
        const store = memoryStore();
        const { result } = renderHook(() => ({ draft: useSettingsDraft(), saved: useUserSettings().settings }), {
            wrapper: wrap(store),
        });
        act(() => result.current.draft.set('boardTheme', 'walnut'));
        expect(result.current.draft.draft.boardTheme).toBe('walnut');
        expect(result.current.saved.boardTheme).toBe('maple');
        act(() => result.current.draft.commit());
        expect(result.current.saved.boardTheme).toBe('walnut');
        expect(result.current.draft.status).toBe('Changes saved.');
        act(() => result.current.draft.reset());
        expect(result.current.draft.draft).toEqual(DEFAULT_SETTINGS);
        expect(result.current.draft.status).toBe('Defaults restored.');
        expect(store.saved).toHaveLength(1);
    });

    test('an invalid value from a row is rejected by the parser', () => {
        const { result } = renderHook(() => useSettingsDraft(), { wrapper: wrap(memoryStore()) });
        act(() => result.current.set('boardTheme', 'neon'));
        expect(result.current.draft.boardTheme).toBe('maple');
    });
});

describe('BoardPreview', () => {
    test('plays and undoes e2-e4 with the draft highlights; the click follows the draft sound setting', () => {
        const { container, rerender } = render(<BoardPreview settings={DEFAULT_SETTINGS} />);
        expect(container.querySelectorAll('[data-mark="last"]')).toHaveLength(2);
        expect(container.querySelectorAll('[data-dot]')).toHaveLength(2);
        fireEvent.click(screen.getByRole('button', { name: 'Play e2 to e4' }));
        expect(playPreviewMoveSound).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('button', { name: 'Undo move' })).toBeInTheDocument();
        rerender(
            <BoardPreview
                settings={{
                    ...DEFAULT_SETTINGS,
                    moveSounds: false,
                    highlightLastMove: false,
                    highlightLegalMoves: false,
                }}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Undo move' }));
        expect(playPreviewMoveSound).toHaveBeenCalledTimes(1);
        expect(container.querySelectorAll('[data-mark="last"]')).toHaveLength(0);
        expect(container.querySelectorAll('[data-dot]')).toHaveLength(0);
    });
});
