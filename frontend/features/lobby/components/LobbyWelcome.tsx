interface LobbyWelcomeProps {
    /** Display name (or username); null while signed out. */
    name: string | null;
}

/** "Welcome back, …" over the page title (Main.dc.html). */
export function LobbyWelcome({ name }: LobbyWelcomeProps) {
    return (
        <div className="flex flex-col gap-2">
            <p className="m-0 text-[15px] font-medium text-ink-muted">
                {name ? `Welcome back, ${name}` : 'Welcome to Gambit'}
            </p>
            <h1 className="m-0 font-display text-[52px] font-bold leading-[1.02] tracking-[-0.03em]">
                Pick a time control.
            </h1>
        </div>
    );
}
