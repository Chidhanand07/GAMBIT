/** HoverTrail: attached only for a hovering pointer and without reduced motion (F-111). */
import { render } from '@testing-library/react';

const attachHoverTrail = jest.fn(() => () => {});
jest.mock('@/lib/design/hoverTrail', () => ({ attachHoverTrail: (...a: unknown[]) => attachHoverTrail(...(a as [])) }));

import HoverTrail from '@/components/effects/HoverTrail';

const media = (matching: string[]) => {
    window.matchMedia = jest.fn((q: string) => ({ matches: matching.includes(q) })) as unknown as typeof window.matchMedia;
};

const mount = () =>
    render(
        <div>
            <HoverTrail />
        </div>,
    );

beforeEach(() => attachHoverTrail.mockClear());

test('mouse or trackpad: the trail is attached', () => {
    media(['(hover: hover) and (pointer: fine)']);
    mount();
    expect(attachHoverTrail).toHaveBeenCalledTimes(1);
});

test('touch-only device: no trail, no cells', () => {
    media([]);
    mount();
    expect(attachHoverTrail).not.toHaveBeenCalled();
});

test('reduced motion wins over a hovering pointer', () => {
    media(['(hover: hover) and (pointer: fine)', '(prefers-reduced-motion: reduce)']);
    mount();
    expect(attachHoverTrail).not.toHaveBeenCalled();
});
