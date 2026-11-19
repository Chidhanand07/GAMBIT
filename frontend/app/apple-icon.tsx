import { ImageResponse } from 'next/og';
import { BRAND_COLORS } from '@/lib/design/brandColors';
import { KnightArt } from '@/features/landing/share/KnightArt';

// The iOS home-screen icon: an opaque gold square (iOS rounds the corners) with the knight (F-114).
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** The knight fills the tile as in the 40px header tile (26 of 40). */
const KNIGHT_SHARE = 26 / 40;

export default function AppleIcon() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: BRAND_COLORS.accent,
                }}
            >
                <KnightArt width={size.width * KNIGHT_SHARE} />
            </div>
        ),
        size,
    );
}
