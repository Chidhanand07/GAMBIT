import Link from 'next/link';
import { LogoTile } from '@/components/ui/KnightMark';
import { FOOTER_LINKS } from '../landingContent';

/** Landing footer (Home.dc.html): logo line, footer nav, copyright. */
export function HomeFooter() {
    return (
        <footer className="mt-8 border-t-1 border-line bg-surface-inset">
            <div className="mx-auto box-border flex max-w-[1280px] flex-col items-center gap-3 p-8 text-center">
                <div className="flex items-center gap-[10px]">
                    <LogoTile size="sm" />
                    <span className="font-display text-[18px] font-bold">Gambit</span>
                    <span className="text-[14px] text-ink-muted">· Chess, perfected.</span>
                </div>
                <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-3 gap-y-1">
                    {FOOTER_LINKS.map((link) => (
                        <Link
                            key={link.label}
                            href={link.href}
                            className="flex min-h-[44px] items-center px-3 no-underline"
                        >
                            {link.label}
                        </Link>
                    ))}
                </nav>
                <span className="text-[13px] text-ink-muted">© 2026 Gambit</span>
            </div>
        </footer>
    );
}
