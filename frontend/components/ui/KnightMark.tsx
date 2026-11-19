import { cn } from '@/lib/design/cn';

/** The knight path shared by the logo, the splash and the Piece knight (design/*.dc.html). */
const KNIGHT_PATH =
    'M23 50C22 44 24 39 29.500 35L24 37.600C22.800 38 21.400 37.600 20.600 36.700L13.500 30.200C12.800 29.400 13 28.200 14 27.600L23.200 22.600C24 21.600 24.300 20.400 24.800 19L25.200 10.800L30.200 16.200C31.800 15.200 33.600 14.800 35.500 14.800C43 15.500 47.500 23.500 47 32C46.700 38 45 44 43.500 50Z';

/** `on-accent`: dark knight with a gold eye (logo tiles); `accent`: gold knight with a deep eye (splash). */
export type KnightTone = 'on-accent' | 'accent';

const TONES: Record<KnightTone, { body: string; eye: string }> = {
    'on-accent': { body: 'fill-on-accent', eye: 'fill-accent' },
    accent: { body: 'fill-accent', eye: 'fill-bg-deep' },
};

interface KnightGlyphProps {
    width: number;
    height?: number;
    tone?: KnightTone;
    className?: string;
}

/** The knight on its two-step base (viewBox 10 8 44 52), always decorative. */
export function KnightGlyph({ width, height = width, tone = 'on-accent', className }: KnightGlyphProps) {
    const { body, eye } = TONES[tone];
    return (
        <svg aria-hidden="true" width={width} height={height} viewBox="10 8 44 52" className={className}>
            <g transform="translate(1.8 0)">
                <path d={KNIGHT_PATH} className={body} />
                <circle cx="27.200" cy="23.800" r="1.800" className={eye} />
            </g>
            <rect x="17.500" y="50.500" width="29" height="3.200" rx="1.600" className={body} />
            <rect x="13.500" y="54" width="37" height="5" rx="2.200" className={body} />
        </svg>
    );
}

export type LogoTileSize = 'sm' | 'md' | 'lg';

/** Tile size, radius and knight size: footer 32px, header 40px, auth card 56px. */
const TILE_SIZES: Record<LogoTileSize, { tile: string; glyph: number }> = {
    sm: { tile: 'h-8 w-8 rounded-10', glyph: 22 },
    md: { tile: 'h-10 w-10 rounded-12', glyph: 26 },
    lg: { tile: 'h-14 w-14 rounded-16', glyph: 40 },
};

/** The gold logo tile with the knight. */
export function LogoTile({ size = 'md', className }: { size?: LogoTileSize; className?: string }) {
    const { tile, glyph } = TILE_SIZES[size];
    return (
        <span
            aria-hidden="true"
            className={cn('flex items-center justify-center bg-accent text-on-accent', tile, className)}
        >
            <KnightGlyph width={glyph} />
        </span>
    );
}
