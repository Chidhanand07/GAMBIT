import { useCallback } from 'react';
import { useToast } from '@/components/Toast';
import { rejectionMessage } from '@/lib/socket/ack';

/** Callback for `useMatchmaking`: tells the user a pairing could not be turned into a game. */
export function useMatchFailedToast(): () => void {
    const { toast } = useToast();
    return useCallback(
        () => toast('We found an opponent but could not start the game. Please search again.', 'error'),
        [toast],
    );
}

/** Callback for `useMatchmaking`: tells the user why the server refused to queue them (ACKS). */
export function useQueueRefusedToast(): (code: string) => void {
    const { toast } = useToast();
    return useCallback((code: string) => toast(rejectionMessage(code), 'error'), [toast]);
}
