/** @jest-environment node */
/**
 * The two Playwright configs must not overlap: `npm run test:e2e` (landing, all browsers) must not run
 * the visual parity harness, which needs the TEST Supabase project and runs through `npm run test:parity`.
 */
import landingConfig from '../../playwright.config';
import parityConfig from '../../e2e/parity/playwright.config';

test('the landing config ignores the parity harness folder', () => {
    expect(landingConfig.testDir).toBe('./e2e');
    expect(landingConfig.testIgnore).toEqual(expect.arrayContaining(['**/parity/**']));
});

test('the parity config only matches the parity spec', () => {
    expect(parityConfig.testMatch).toBe('parity.spec.ts');
});
