import { AvatarImage } from '@/components/ui/AvatarImage';

/** Round avatar photo filling its container; `size` is the container's width in CSS pixels. */
export function AvatarImg({ src, size }: { src: string; size: number }) {
    return <AvatarImage src={src} size={size} />;
}
