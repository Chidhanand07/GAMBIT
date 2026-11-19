import { experienceLabel, isHttpsUrl, playingStyleLabel } from '@/lib/profile/fields';

describe('profile fields [F-127]', () => {
    test.each([
        ['https://lichess.org/@/bob', true],
        ['https://example.com', true],
        ['https://example.com/a?b=c#d', true],
        ['http://example.com', false],
        ['javascript:alert(1)', false],
        ['https://', false],
        ['https:///path', false],
        ['https://exa mple.com', false],
        ['ftp://example.com', false],
        ['', false],
    ])('isHttpsUrl(%p) → %p', (url, ok) => {
        expect(isHttpsUrl(url)).toBe(ok);
    });

    test('labels for stored choices; null for empty or unknown values', () => {
        expect(playingStyleLabel('aggressive')).toBe('Aggressive');
        expect(experienceLabel('club')).toBe('Club player');
        expect(playingStyleLabel(null)).toBeNull();
        expect(experienceLabel('grandmaster')).toBeNull();
        expect(playingStyleLabel('toString')).toBeNull();
    });
});
