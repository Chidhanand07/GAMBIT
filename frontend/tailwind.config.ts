import type { Config } from 'tailwindcss';

/** `var(--name)`: every redesign token is defined once, as a CSS variable in app/globals.css. */
const v = (name: string) => `var(--${name})`;

/** Map token keys to `var(--<prefix>-<key>)`. */
const scale = (prefix: string, keys: readonly string[]) =>
    Object.fromEntries(keys.map((key) => [key, v(`${prefix}-${key}`)]));

const config: Config = {
    content: [
        './pages/**/*.{js,ts,jsx,tsx,mdx}',
        './components/**/*.{js,ts,jsx,tsx,mdx}',
        './features/**/*.{js,ts,jsx,tsx,mdx}',
        './app/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    theme: {
        extend: {
            colors: {
                // ── Redesign tokens (design/HANDOFF.md §2) ──────────────────────────────
                'bg-deep': v('color-bg-deep'),
                'bg-base': v('color-bg-base'),
                'bg-gradient-top': v('color-bg-gradient-top'),
                surface: {
                    DEFAULT: v('color-surface'),
                    header: v('color-surface-header'),
                    raised: v('color-surface-raised'),
                    inset: v('color-surface-inset'),
                },
                scrim: v('color-scrim'),
                splash: { center: v('color-splash-center'), skip: v('color-splash-skip') },
                line: {
                    DEFAULT: v('color-line'),
                    ...scale('color-line', ['subtle', 'strong', 'muted', 'row', 'field']),
                },
                accent: {
                    DEFAULT: v('color-accent'),
                    hover: v('accent-hover'), // legacy, used by the challenge and invite pages
                },
                ink: {
                    DEFAULT: v('color-ink'),
                    ...scale('color-ink', ['muted', 'faint', 'disabled', 'placeholder', 'bright']),
                },
                'on-accent': { DEFAULT: v('color-on-accent'), muted: v('color-on-accent-muted') },
                success: { DEFAULT: v('color-success'), ink: v('color-success-ink'), bg: v('color-success-bg') },
                danger: {
                    DEFAULT: v('color-danger'),
                    ...scale('color-danger', ['line', 'bg', 'zone-line', 'zone-bg']),
                },
                board: scale('color-board', [
                    'light',
                    'dark',
                    'frame',
                    'green-light',
                    'green-dark',
                    'slate-light',
                    'slate-dark',
                    'walnut-light',
                    'walnut-dark',
                    'hero-last-light',
                    'hero-last-dark',
                ]),
                mark: scale('color-mark', [
                    'last',
                    'check',
                    'selected',
                    'capture',
                    'dot',
                    'preview-dot',
                    'preview-hint',
                ]),
                piece: scale('color-piece', [
                    'white-fill',
                    'white-line',
                    'white-detail',
                    'black-fill',
                    'black-line',
                    'black-detail',
                    'glyph-white',
                    'glyph-black',
                    'glyph-neo',
                ]),

                // ── Legacy tokens: pages not yet moved to the redesign (HANDOFF §8 step 4) ──
                page: v('bg-page'),
                elevated: v('bg-elevated'),
                hover: v('bg-hover'),
                text: { primary: v('text-primary'), secondary: v('text-secondary'), tertiary: v('text-tertiary') },
                border: { DEFAULT: v('border'), strong: v('border-strong') },
            },
            fontFamily: {
                sans: [v('font-inter'), 'Inter', 'system-ui', 'sans-serif'],
                display: [v('font-space-grotesk'), v('font-inter'), 'Inter', 'sans-serif'],
                mono: [v('font-jetbrains-mono'), 'ui-monospace', 'monospace'],
                symbols: [v('font-noto-symbols-2'), 'serif'],
            },
            fontSize: {
                body: [v('font-size-body'), { lineHeight: v('line-height-body') }],
            },
            fontWeight: {
                normal: '400',
                medium: '500',
            },
            borderRadius: {
                // legacy
                lg: '14px',
                // redesign
                ...scale('radius', ['3', '4', '10', '12', '14', '16', '20', '24', '28', 'pill']),
            },
            boxShadow: {
                board: '0 8px 32px rgba(0,0,0,0.5)', // legacy
                ...scale('shadow', [
                    'header',
                    'popover',
                    'tile-hover',
                    'nav-pill',
                    'dialog',
                    'auth-card',
                    'board-hero',
                    'board-analysis',
                    'board-preview',
                    'focus-ring',
                    'turn-dot',
                    'avatar-ring',
                    'trail-active',
                    'trail-hot',
                    'trail-trace',
                    'splash-particle',
                    'best-move',
                ]),
            },
            dropShadow: {
                piece: v('drop-shadow-piece'),
                'splash-knight': v('drop-shadow-splash-knight'),
            },
            transitionTimingFunction: scale('ease', ['spring', 'spring-nav', 'piece', 'splash', 'splash-particle']),
            transitionDuration: scale('duration', [
                '70',
                '200',
                '220',
                '260',
                '300',
                '360',
                '400',
                '420',
                '500',
                '520',
                '560',
                '700',
                '900',
                '1100',
                '2100',
                '2400',
            ]),
            animation: {
                trace: `gtrace ${v('duration-2400')} ease forwards`,
                'nav-pill-in': `gslide ${v('duration-560')} ${v('ease-spring-nav')} 80ms backwards`,
            },
            borderWidth: {
                DEFAULT: '0.5px', // legacy
                1: '1px',
                1.5: '1.5px',
                2: '2px',
                3: '3px',
            },
        },
    },
    plugins: [],
};
export default config;
