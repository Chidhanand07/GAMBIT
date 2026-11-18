/**
 * A4: axe-core checks of a page's main composition (jest-axe). jsdom has no layout, so the
 * colour-contrast rule cannot run here (contrast is checked from the tokens, see
 * __tests__/a11y/contrast.test.ts). `region` is off because a page is rendered without the
 * root layout, whose <main> and header provide the landmarks.
 */
import { configureAxe } from 'jest-axe'

export const axe = configureAxe({
    rules: {
        region: { enabled: false },
        'color-contrast': { enabled: false },
    },
})

/** Runs axe on `container` and fails with the list of violations. */
export async function expectAccessible(container: Element) {
    expect(await axe(container)).toHaveNoViolations()
}

/** axe takes a few seconds on a whole page when the suite runs in parallel. */
export const AXE_TIMEOUT_MS = 20_000
