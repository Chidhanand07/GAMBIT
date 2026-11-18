import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { ActiveGame } from '@/types/lobby';

/** A game of yours is still running: a link back to it. */
export function ActiveGameBanner({ activeGame }: { activeGame: ActiveGame }) {
    return (
        <Card as="div" tone="raised" className="flex flex-wrap items-center justify-between gap-4 border-accent py-4">
            <span className="font-semibold">You have an active game in progress</span>
            <Button href={`/game/${activeGame.id}`} className="flex">
                Resume →
            </Button>
        </Card>
    );
}
