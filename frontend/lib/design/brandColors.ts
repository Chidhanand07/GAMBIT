// Brand colours for renderers that cannot read CSS variables: the next/og share images and icons.
// Each value is the token of the same name in app/globals.css (a unit test keeps them equal).

export const BRAND_COLORS = {
    'bg-deep': '#0C1813',
    'bg-base': '#0F1E18',
    'bg-gradient-top': '#14291F',
    surface: '#183026',
    line: '#30493D',
    accent: '#EFBF5B',
    ink: '#F6F0E0',
    'ink-muted': '#B7C2B3',
    'on-accent': '#10140F',
    'splash-center': '#1B3A2B',
} as const;

export type BrandColor = keyof typeof BRAND_COLORS;
