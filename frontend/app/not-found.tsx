import { CenteredCard } from '@/components/layout/CenteredCard';
import { Button } from '@/components/ui/Button';

/** Any URL with no page (no mockup: the sign-in card's layout and tokens). */
export default function NotFound() {
    return (
        <CenteredCard title="Page not found" subtitle="The page you are looking for does not exist or has moved.">
            <div className="flex flex-col gap-3">
                <Button href="/lobby" size="xl" className="font-bold">
                    Go to the lobby
                </Button>
                <Button href="/" variant="outline" size="xl">
                    Back to home
                </Button>
            </div>
        </CenteredCard>
    );
}
