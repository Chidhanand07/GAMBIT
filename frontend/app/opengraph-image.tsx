import { SHARE_IMAGE_ALT } from '@/features/landing/siteCopy';
import { renderShareImage, SHARE_IMAGE_SIZE, SHARE_IMAGE_TYPE } from '@/features/landing/share/shareImage';

// The Open Graph image of the site (og:image), generated at build time with next/og (F-114).
export const alt = SHARE_IMAGE_ALT;
export const size = SHARE_IMAGE_SIZE;
export const contentType = SHARE_IMAGE_TYPE;

export default function OpenGraphImage() {
    return renderShareImage();
}
