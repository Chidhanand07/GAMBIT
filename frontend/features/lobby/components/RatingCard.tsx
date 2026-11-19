import { Card } from '@/components/ui/Card';

interface RatingCardProps {
    /** "Blitz rating" */
    label: string;
    name: string;
    rating: number;
}

/** The player's rating in the selected time control's category. */
export function RatingCard({ label, name, rating }: RatingCardProps) {
    return (
        <Card as="div" className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 flex-col">
                <span className="text-[13px] font-medium text-ink-muted">{label}</span>
                <span className="font-display text-[18px] font-semibold">{name}</span>
            </div>
            <span className="font-mono text-[44px] font-bold leading-none tracking-[-0.04em] text-accent">
                {rating}
            </span>
        </Card>
    );
}
