interface StagePanelHeaderProps {
    title: string;
    subtitle: string;
    onClose: () => void;
}

/** Title, subtitle and the round "x" close button of the Computer / Friend panels. */
export function StagePanelHeader({ title, subtitle, onClose }: StagePanelHeaderProps) {
    return (
        <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col">
                <h2 className="m-0 font-display text-[24px] font-bold leading-[1.5]">{title}</h2>
                <span className="text-[14px] text-ink-muted">{subtitle}</span>
            </div>
            <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="h-11 w-11 shrink-0 rounded-full border-1 border-line bg-bg-base text-[18px] text-ink"
            >
                x
            </button>
        </div>
    );
}
