import { landingStructuredData, serializeJsonLd } from '@/features/landing/structuredData';

describe('landing JSON-LD (F-114)', () => {
    test('a WebSite and a free SoftwareApplication on the given origin', () => {
        const data = landingStructuredData('https://gambit.example') as { '@graph': Record<string, unknown>[] };
        const [site, app] = data['@graph'];
        expect(site).toMatchObject({ '@type': 'WebSite', url: 'https://gambit.example/', name: 'Gambit' });
        expect(app).toMatchObject({
            '@type': 'SoftwareApplication',
            url: 'https://gambit.example/',
            applicationCategory: 'GameApplication',
            offers: { '@type': 'Offer', price: '0' },
        });
    });

    test('serialisation cannot close the script element or open a comment, and parses back unchanged', () => {
        const hostile = { name: '</script><script>alert(1)</script><!-- & \u2028\u2029' };
        const json = serializeJsonLd(hostile);
        expect(json).not.toMatch(/[<>&\u2028\u2029]/);
        expect(JSON.parse(json)).toEqual(hostile);
    });
});
