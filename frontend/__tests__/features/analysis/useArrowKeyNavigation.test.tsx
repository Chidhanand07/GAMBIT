import { fireEvent, renderHook } from '@testing-library/react';
import { useArrowKeyNavigation } from '@/features/analysis/hooks/useArrowKeyNavigation';

/**
 * F14: the key handler reports a step; it does not call other state setters from inside a
 * state updater (updaters must be pure, and React may run them twice).
 */
describe('useArrowKeyNavigation', () => {
    test('ArrowLeft / ArrowRight report -1 / +1', () => {
        const onStep = jest.fn();
        renderHook(() => useArrowKeyNavigation(onStep));
        fireEvent.keyDown(window, { key: 'ArrowLeft' });
        fireEvent.keyDown(window, { key: 'ArrowRight' });
        expect(onStep.mock.calls).toEqual([[-1], [1]]);
    });

    test('keys typed into an input are ignored', () => {
        const onStep = jest.fn();
        renderHook(() => useArrowKeyNavigation(onStep));
        const input = document.createElement('input');
        document.body.appendChild(input);
        fireEvent.keyDown(input, { key: 'ArrowLeft' });
        expect(onStep).not.toHaveBeenCalled();
        input.remove();
    });
});
