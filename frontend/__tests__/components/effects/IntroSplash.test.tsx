/**
 * IntroSplash (design/HANDOFF.md §4.3). Replaces the KnightIntro canvas tests: the same
 * behaviours (skip ends it, it ends on its own, reduced motion shows nothing, once per session)
 * against the CSS splash.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import IntroSplash, { INTRO_SEEN_KEY } from '@/components/effects/IntroSplash';

const setReducedMotion = (matches: boolean) => {
    window.matchMedia = jest.fn().mockReturnValue({ matches }) as unknown as typeof window.matchMedia;
};

/** jsdom has no AnimationEvent constructor that carries animationName; build one by hand. */
function endAnimation(el: Element, animationName: string) {
    const event = new Event('animationend', { bubbles: true });
    Object.defineProperty(event, 'animationName', { value: animationName });
    act(() => {
        el.dispatchEvent(event);
    });
}

beforeEach(() => {
    window.sessionStorage.clear();
    setReducedMotion(false);
});

describe('IntroSplash', () => {
    test('plays on the first visit of a session: 90 particles, knight, wordmark, tagline, Skip', () => {
        render(<IntroSplash />);
        const splash = screen.getByTestId('intro-splash');
        expect(splash).toHaveClass('gsplash');
        expect(splash.querySelectorAll('.gsp')).toHaveLength(90);
        expect((splash.querySelector('.gsp') as HTMLElement).style.getPropertyValue('--x')).toBe('-354px');
        expect(splash.querySelector('.gsk svg')).not.toBeNull();
        expect(screen.getByText('GAMBIT')).toHaveClass('gsw');
        expect(screen.getByText('Chess, perfected.')).toHaveClass('gst');
        expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument();
        expect(window.sessionStorage.getItem(INTRO_SEEN_KEY)).toBe('1');
    });

    test('Skip removes the overlay at once', () => {
        render(<IntroSplash />);
        fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
        expect(screen.queryByTestId('intro-splash')).not.toBeInTheDocument();
    });

    test('the overlay unmounts when its own fade-out ends, not when a child animation ends', () => {
        render(<IntroSplash />);
        const splash = screen.getByTestId('intro-splash');
        endAnimation(splash.querySelector('.gsp')!, 'gspc');
        endAnimation(splash, 'gsk');
        expect(screen.getByTestId('intro-splash')).toBeInTheDocument();
        endAnimation(splash, 'gsout');
        expect(screen.queryByTestId('intro-splash')).not.toBeInTheDocument();
    });

    test('shows once per session', () => {
        window.sessionStorage.setItem(INTRO_SEEN_KEY, '1');
        render(<IntroSplash />);
        expect(screen.queryByTestId('intro-splash')).not.toBeInTheDocument();
    });

    test('reduced motion: never shown, and Replay does nothing', () => {
        setReducedMotion(true);
        render(<IntroSplash />);
        expect(screen.queryByTestId('intro-splash')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Replay intro' }));
        expect(screen.queryByTestId('intro-splash')).not.toBeInTheDocument();
        expect(window.sessionStorage.getItem(INTRO_SEEN_KEY)).toBeNull();
    });

    test('Replay intro plays it again after it was seen', () => {
        window.sessionStorage.setItem(INTRO_SEEN_KEY, '1');
        render(<IntroSplash />);
        fireEvent.click(screen.getByRole('button', { name: 'Replay intro' }));
        expect(screen.getByTestId('intro-splash')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
        fireEvent.click(screen.getByRole('button', { name: 'Replay intro' }));
        expect(screen.getByTestId('intro-splash')).toBeInTheDocument();
    });

    test('blocked storage counts as seen (no splash, no crash)', () => {
        const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        render(<IntroSplash />);
        expect(screen.queryByTestId('intro-splash')).not.toBeInTheDocument();
        getItem.mockRestore();
    });
});
