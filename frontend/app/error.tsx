'use client';

import { CenteredCard } from '@/components/layout/CenteredCard';
import { Button } from '@/components/ui/Button';

interface ErrorPageProps {
    error: Error & { digest?: string };
    /** Re-renders the failed segment. */
    reset: () => void;
}

/**
 * An unexpected error while rendering a page. Nothing about the error is shown or written to the
 * browser console (S14); the user can retry or leave.
 */
export default function ErrorPage({ reset }: ErrorPageProps) {
    return (
        <CenteredCard
            title="Something went wrong"
            subtitle="This page hit an unexpected error. Try again, or head back to the lobby."
        >
            <div role="alert" className="flex flex-col gap-3">
                <Button size="xl" className="font-bold" onClick={reset}>
                    Try again
                </Button>
                <Button href="/lobby" variant="outline" size="xl">
                    Go to the lobby
                </Button>
            </div>
        </CenteredCard>
    );
}
