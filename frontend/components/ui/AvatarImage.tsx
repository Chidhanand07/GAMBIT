import Image from 'next/image';
import { isOptimizableImageUrl } from '@/lib/imageHosts';

interface AvatarImageProps {
    src: string;
    /** Rendered size in CSS pixels (the avatar's box); also the requested image width. */
    size: number;
    className?: string;
}

/**
 * A user's avatar photo through next/image. URLs on the configured hosts (Supabase storage,
 * Google) are resized by the optimizer to the box size; any other URL is shown as-is
 * (`unoptimized`), because next/image refuses unlisted hosts and an avatar URL is user data.
 */
export function AvatarImage({ src, size, className = 'w-full h-full object-cover' }: AvatarImageProps) {
    return (
        <Image
            src={src}
            alt=""
            width={size}
            height={size}
            sizes={`${size}px`}
            unoptimized={!isOptimizableImageUrl(src)}
            className={className}
        />
    );
}
