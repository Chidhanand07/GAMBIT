import { countryCode } from '@/lib/chess/country';

describe('countryCode [F-126]', () => {
    test.each([
        ['India', 'IN'],
        ['india', 'IN'],
        ['  Germany ', 'DE'],
        ['United Kingdom', 'GB'],
        ['United States', 'US'],
        ['USA', 'US'],
        ['uk', 'GB'],
        ['in', 'IN'],
        ['FR', 'FR'],
    ])('%p → %p', (country, code) => {
        expect(countryCode(country)).toBe(code);
    });

    test.each([null, undefined, '', '   ', 'Narnia', 'Earth'])('%p → null (no chip)', (country) => {
        expect(countryCode(country)).toBeNull();
    });
});
