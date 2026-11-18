import { boardPrefsOf, DEFAULT_SETTINGS, parseSettings } from '@/features/settings/model';
import { createLocalSettingsStore, SETTINGS_STORAGE_KEY } from '@/features/settings/store';
import { preferredBoardProps } from '@/features/settings/boardProps';

describe('parseSettings', () => {
    test('anything that is not an object reads as the defaults', () => {
        for (const raw of [null, undefined, 'x', 42, []]) expect(parseSettings(raw)).toEqual(DEFAULT_SETTINGS);
    });
    test('keeps valid values, replaces invalid ones and drops unknown keys', () => {
        const parsed = parseSettings({
            boardTheme: 'walnut',
            pieceAnimation: 'warp',
            defaultTimeControl: 'rapid',
            moveSounds: false,
            showCoordinates: 'yes',
            extra: 1,
        });
        expect(parsed).toEqual({
            ...DEFAULT_SETTINGS,
            boardTheme: 'walnut',
            defaultTimeControl: 'rapid',
            moveSounds: false,
        });
    });
    test('[F-100] coordinates default to off, as on the Game and Analysis mockups; a stored choice wins', () => {
        expect(DEFAULT_SETTINGS.showCoordinates).toBe(false);
        expect(parseSettings({}).showCoordinates).toBe(false);
        expect(parseSettings({ showCoordinates: true }).showCoordinates).toBe(true);
    });
});

describe('boardPrefsOf', () => {
    test('maps the settings onto Board props, slide duration and sound', () => {
        expect(boardPrefsOf(DEFAULT_SETTINGS)).toEqual({
            theme: 'maple',
            animate: true,
            slideMs: 420,
            showCoordinates: false,
            highlightLegalMoves: true,
            highlightLastMove: true,
            sound: true,
        });
        const off = boardPrefsOf({ ...DEFAULT_SETTINGS, pieceAnimation: 'off', moveSounds: false });
        expect([off.animate, off.slideMs, off.sound]).toEqual([false, 0, false]);
        expect(boardPrefsOf({ ...DEFAULT_SETTINGS, pieceAnimation: 'fast' }).slideMs).toBe(150);
    });
});

describe('createLocalSettingsStore', () => {
    beforeEach(() => localStorage.clear());

    test('round-trips through localStorage under one key', () => {
        const store = createLocalSettingsStore();
        expect(store.load()).toEqual(DEFAULT_SETTINGS);
        store.save({ ...DEFAULT_SETTINGS, boardTheme: 'green' });
        expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)!)).toMatchObject({ boardTheme: 'green' });
        expect(store.load().boardTheme).toBe('green');
    });

    test('corrupt JSON or blocked storage reads as the defaults; a failing save does not throw', () => {
        localStorage.setItem(SETTINGS_STORAGE_KEY, '{nope');
        expect(createLocalSettingsStore().load()).toEqual(DEFAULT_SETTINGS);
        const blocked = createLocalSettingsStore(() => {
            throw new Error('SecurityError');
        });
        expect(blocked.load()).toEqual(DEFAULT_SETTINGS);
        expect(() => blocked.save(DEFAULT_SETTINGS)).not.toThrow();
    });
});

describe('preferredBoardProps', () => {
    const lastMove = { from: 'e2', to: 'e4' } as const
    const legalDestinations = ['e3', 'e4'] as const

    test('theme, animation and coordinates always; marks only while their switch is on', () => {
        const on = preferredBoardProps(boardPrefsOf({ ...DEFAULT_SETTINGS, showCoordinates: true }), { lastMove, legalDestinations })
        expect(on).toEqual({ theme: 'maple', animate: true, showCoordinates: true, lastMove, legalDestinations })
        const off = preferredBoardProps(
            boardPrefsOf({
                ...DEFAULT_SETTINGS,
                boardTheme: 'slate',
                pieceAnimation: 'off',
                showCoordinates: false,
                highlightLastMove: false,
                highlightLegalMoves: false,
            }),
            { lastMove, legalDestinations },
        )
        expect(off).toEqual({ theme: 'slate', animate: false, showCoordinates: false, lastMove: null, legalDestinations: undefined })
    })

    test('no marks given: no last move', () => {
        expect(preferredBoardProps(boardPrefsOf(DEFAULT_SETTINGS)).lastMove).toBeNull()
    })
})
