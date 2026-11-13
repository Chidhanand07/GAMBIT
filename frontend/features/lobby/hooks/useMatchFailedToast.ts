import { useCallback } from 'react';
import { useToast } from '@/components/Toast';

/** Callback for `useMatchmaking`: tells the user a pairing could not be turned into a game. */
export function useMatchFailedToast(): () => void {
    const { toast } = useToast();
    return useCallback(
        () => toast('We found an opponent but could not start the game. Please search again.', 'error'),
        [toast],
    );
}
