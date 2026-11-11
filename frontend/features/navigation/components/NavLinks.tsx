import Link from 'next/link';
import { accentHover, hoverStyles } from '../hover';
import { NAV_LINKS, isActivePath } from '../navLinks';

/** Centre links (desktop) with the accent underline on the active one. */
export function DesktopNavLinks({ pathname }: { pathname: string }) {
    return (
        <div className="hidden md:flex items-center gap-1 flex-1">
            {NAV_LINKS.map((link) => {
                const active = isActivePath(pathname, link.href);
                return (
                    <Link
                        key={link.href}
                        href={link.href}
                        className={`relative px-3 py-1.5 text-sm transition-colors duration-150 rounded-md ${active ? '' : 'hover:bg-hover'}`}
                        style={{ color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                    >
                        {link.label}
                        {active && (
                            <span
                                className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full"
                                style={{ background: 'var(--accent)' }}
                            />
                        )}
                    </Link>
                );
            })}
        </div>
    );
}

const logInHover = hoverStyles(
    { color: 'var(--text-primary)', borderColor: 'var(--border)', background: 'var(--bg-hover)' },
    { color: 'var(--text-secondary)', borderColor: 'transparent', background: '' },
);

/** Log In / Sign Up for signed-out visitors (desktop). */
export function GuestLinks() {
    return (
        <div className="hidden md:flex items-center gap-2">
            <Link
                href="/login"
                className="px-3 py-1.5 text-sm rounded-md border border-transparent transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                {...logInHover}
            >
                Log In
            </Link>
            <Link
                href="/signup"
                className="px-4 py-1.5 text-sm font-medium rounded-lg btn-press transition-colors"
                style={{ background: 'var(--accent)', color: '#0F0D0B' }}
                {...accentHover}
            >
                Sign Up
            </Link>
        </div>
    );
}

interface MobileMenuProps {
    pathname: string;
    signedIn: boolean;
    onClose: () => void;
}

/** Mobile menu panel under the navbar. */
export function MobileMenu({ pathname, signedIn, onClose }: MobileMenuProps) {
    return (
        <div
            className="md:hidden fixed top-[53px] inset-x-0 z-40 border-b shadow-xl"
            style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}
        >
            <div className="px-4 py-3 flex flex-col gap-1">
                {NAV_LINKS.map((link) => (
                    <Link
                        key={link.href}
                        href={link.href}
                        onClick={onClose}
                        className="px-3 py-2.5 rounded-lg text-sm transition-colors"
                        style={{
                            background: isActivePath(pathname, link.href) ? 'var(--accent-dim)' : 'transparent',
                            color: isActivePath(pathname, link.href) ? 'var(--accent)' : 'var(--text-secondary)',
                        }}
                    >
                        {link.label}
                    </Link>
                ))}
                {!signedIn && (
                    <div className="flex gap-2 mt-2 pt-2" style={{ borderTop: '0.5px solid var(--border)' }}>
                        <Link
                            href="/login"
                            onClick={onClose}
                            className="flex-1 text-center py-2 text-sm rounded-lg border transition-colors"
                            style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
                        >
                            Log In
                        </Link>
                        <Link
                            href="/signup"
                            onClick={onClose}
                            className="flex-1 text-center py-2 text-sm font-medium rounded-lg"
                            style={{ background: 'var(--accent)', color: '#0F0D0B' }}
                        >
                            Sign Up
                        </Link>
                    </div>
                )}
            </div>
        </div>
    );
}
