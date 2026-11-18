import type { ReactNode } from 'react';
import { cn } from '@/lib/design/cn';

interface GameLayoutProps {
    /** Focus mode: no title or side panels, the board centred with its actions to the right. */
    focus: boolean;
    title: string;
    subtitle: string;
    /** Green pills under the title, e.g. "Rated", "Blitz 5 min". */
    pills: readonly string[];
    /** The pill buttons above the board (focus mode, sound); none: no row. */
    boardTools?: ReactNode;
    /** Banners, player bars and the board. */
    board: ReactNode;
    focusActions?: ReactNode;
    aside: ReactNode;
}

const PILL = 'rounded-pill bg-success-bg px-3 py-1 text-[13px] font-semibold text-success-ink';

function GameTitle({ title, subtitle, pills }: Pick<GameLayoutProps, 'title' | 'subtitle' | 'pills'>) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col">
                <h1 className="m-0 font-display text-[30px] font-bold leading-[1.5] tracking-[-0.02em]">{title}</h1>
                <span className="text-[14px] text-ink-muted">{subtitle}</span>
                <div className="mt-2 flex flex-wrap gap-2">
                    {pills.map((pill) => (
                        <span key={pill} className={PILL}>
                            {pill}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
}

/** The live game screen's frame (Game.dc.html): title, board section, side panels, focus mode. */
export function GameLayout(props: GameLayoutProps) {
    const { focus, boardTools, board, focusActions, aside } = props;
    return (
        <div className="mx-auto box-border flex max-w-[1400px] flex-col gap-5 px-8 pb-16 pt-8">
            {!focus && <GameTitle title={props.title} subtitle={props.subtitle} pills={props.pills} />}
            <div className={cn('flex flex-wrap items-stretch gap-6', focus ? 'justify-center' : 'justify-start')}>
                <section
                    className={cn(
                        'box-border flex min-w-0 flex-[1_1_640px] flex-col gap-3 rounded-20 border-1',
                        focus
                            ? 'max-w-[min(calc(100vh_-_150px),1000px)] border-transparent bg-transparent p-0'
                            : 'max-w-[960px] border-line bg-surface p-5',
                    )}
                >
                    {boardTools && <div className="flex justify-end gap-2">{boardTools}</div>}
                    {board}
                </section>
                {focus && focusActions}
                {!focus && <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-4">{aside}</aside>}
            </div>
        </div>
    );
}
