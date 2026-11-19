import { Skeleton } from '@/components/ui/Skeleton';

export type SkeletonLayout = 'board' | 'list' | 'profile' | 'tiles' | 'card';

/** Page widths of the mockups (Game 1400, Lobby/Leaderboard/Analysis 1280, forms 640). */
const WIDTH: Record<SkeletonLayout, string> = {
    board: 'max-w-[1400px]',
    list: 'max-w-[1280px]',
    profile: 'max-w-[1280px]',
    tiles: 'max-w-[1280px]',
    card: 'max-w-[640px]',
};

function BoardBody() {
    return (
        <div className="flex flex-wrap gap-6">
            <Skeleton className="aspect-square min-w-0 max-w-[960px] flex-[1_1_640px] rounded-20" />
            <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-4">
                <Skeleton className="h-[200px] rounded-20" />
                <Skeleton className="h-[240px] rounded-20" />
            </div>
        </div>
    );
}

function ListBody() {
    return (
        <div className="flex flex-col gap-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-[64px] rounded-16" />
            ))}
        </div>
    );
}

function TilesBody() {
    return (
        <div className="flex flex-wrap gap-4">
            {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[216px] min-w-0 flex-[1_1_180px] rounded-20" />
            ))}
        </div>
    );
}

const BODIES: Record<SkeletonLayout, () => React.JSX.Element> = {
    board: BoardBody,
    list: ListBody,
    profile: () => (
        <>
            <Skeleton className="h-[180px] rounded-24" />
            <ListBody />
        </>
    ),
    tiles: TilesBody,
    card: () => <Skeleton className="h-[420px] rounded-20" />,
};

interface PageSkeletonProps {
    layout: SkeletonLayout;
    /** Announced to assistive tech, e.g. "Loading game". */
    label: string;
}

/** A route's `loading.tsx`: the page's outline in card-surface blocks while its data loads. */
export function PageSkeleton({ layout, label }: PageSkeletonProps) {
    const Body = BODIES[layout];
    return (
        <div
            role="status"
            aria-label={label}
            className={`mx-auto box-border flex w-full flex-col gap-6 px-6 pb-16 pt-9 sm:px-8 ${WIDTH[layout]}`}
        >
            <Skeleton className="h-10 w-[240px] max-w-full rounded-12" />
            <Body />
        </div>
    );
}
