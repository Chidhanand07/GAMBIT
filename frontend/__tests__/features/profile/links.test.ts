import { challengeHref, gameHref, profileHref } from '@/features/profile/links';

describe('profile links (F12)', () => {
    test('usernames and ids are URI-encoded', () => {
        expect(profileHref('bob smith')).toBe('/profile/bob%20smith');
        expect(challengeHref('a/b')).toBe('/challenge/a%2Fb');
        expect(gameHref('g?1')).toBe('/game/g%3F1');
    });
    test('plain names are unchanged', () => {
        expect(profileHref('alice')).toBe('/profile/alice');
    });
});
