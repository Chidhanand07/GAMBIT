import { SHARE_IMAGE_ALT } from '@/features/landing/siteCopy';
import { renderShareImage, SHARE_IMAGE_SIZE, SHARE_IMAGE_TYPE } from '@/features/landing/share/shareImage';

// The Twitter / X card image (twitter:image): the same card as the Open Graph image (F-114).
export const alt = SHARE_IMAGE_ALT;
export const size = SHARE_IMAGE_SIZE;
export const contentType = SHARE_IMAGE_TYPE;

export default function TwitterImage() {
    return renderShareImage();
}
