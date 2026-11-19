import { BRAND_COLORS } from '@/lib/design/brandColors';

// The logo knight (components/ui/KnightMark.tsx) with literal fills, for next/og renderers that
// have no stylesheet: the share images and the app icons.

const KNIGHT_PATH =
    'M23 50C22 44 24 39 29.500 35L24 37.600C22.800 38 21.400 37.600 20.600 36.700L13.500 30.200C12.800 29.400 13 28.200 14 27.600L23.200 22.600C24 21.600 24.300 20.400 24.800 19L25.200 10.800L30.200 16.200C31.800 15.200 33.600 14.800 35.500 14.800C43 15.500 47.500 23.500 47 32C46.700 38 45 44 43.500 50Z';

interface KnightArtProps {
    width: number;
    height?: number;
    /** Body and base colour, and the eye. Default: dark knight, gold eye (the logo tile). */
    body?: string;
    eye?: string;
}

export function KnightArt({
    width,
    height = width,
    body = BRAND_COLORS['on-accent'],
    eye = BRAND_COLORS.accent,
}: KnightArtProps) {
    return (
        <svg width={width} height={height} viewBox="10 8 44 52">
            <g transform="translate(1.8 0)">
                <path d={KNIGHT_PATH} fill={body} />
                <circle cx="27.2" cy="23.8" r="1.8" fill={eye} />
            </g>
            <rect x="17.5" y="50.5" width="29" height="3.2" rx="1.6" fill={body} />
            <rect x="13.5" y="54" width="37" height="5" rx="2.2" fill={body} />
        </svg>
    );
}

/** The gold logo tile with the knight, `size` px square (header tile: 40px, radius 12px, knight 26px). */
export function LogoTileArt({ size }: { size: number }) {
    const TILE = 40;
    const KNIGHT = 26;
    const RADIUS = 12;
    const scale = size / TILE;
    return (
        <div
            style={{
                width: size,
                height: size,
                borderRadius: RADIUS * scale,
                background: BRAND_COLORS.accent,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <KnightArt width={KNIGHT * scale} />
        </div>
    );
}
