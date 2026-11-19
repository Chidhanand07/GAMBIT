import { HERO_STATS, heroCtas, TIME_CONTROL_COUNT } from '@/features/landing/landingContent';
import { TIME_CONTROL_PRESETS } from '@/lib/chess/timeControl';

describe('hero calls to action (F-110)', () => {
    test('guest: Play Now → /lobby (the proxy asks them to sign in), Create Account → /signup', () => {
        expect(heroCtas({ status: 'guest' })).toEqual({
            primary: { label: 'Play Now', href: '/lobby' },
            secondary: { label: 'Create Account', href: '/signup' },
        });
    });

    test('signed in: Play Now → /lobby directly; the sign-up button becomes My Profile', () => {
        const viewer = {
            status: 'signed-in' as const,
            profile: { id: 'u1', username: 'magnus c', display_name: null, avatar_url: null, rating_rapid: 1500 },
        };
        expect(heroCtas(viewer)).toEqual({
            primary: { label: 'Play Now', href: '/lobby' },
            secondary: { label: 'My Profile', href: '/profile/magnus%20c' },
        });
    });

    test('a signed-in viewer whose profile could not be read is never offered sign-up', () => {
        expect(heroCtas({ status: 'unknown' }).secondary).toBeNull();
    });
});

describe('hero claims are literally true (F-110)', () => {
    test('the time-control count is the lobby presets plus Custom', () => {
        expect(TIME_CONTROL_COUNT).toBe(Object.keys(TIME_CONTROL_PRESETS).length + 1);
        expect(HERO_STATS.find((s) => s.label === 'time controls')?.value).toBe(String(TIME_CONTROL_COUNT));
        expect(TIME_CONTROL_COUNT).toBe(6); // what Home.dc.html shows
    });
});
