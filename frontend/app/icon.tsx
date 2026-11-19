import { ImageResponse } from 'next/og';
import { LogoTileArt } from '@/features/landing/share/KnightArt';

// The favicon: the gold logo tile with the knight (F-114).
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
    return new ImageResponse(<LogoTileArt size={size.width} />, size);
}
