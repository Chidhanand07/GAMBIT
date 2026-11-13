// Remote image hosts the Next image optimizer may fetch from. `lib/imageHosts.json` is the one
// list: next.config.js passes it to `images.remotePatterns`, and this module decides whether a
// given URL can be optimized. Avatar URLs are user data and may point anywhere; next/image
// throws on an unlisted host, so such a URL is rendered unoptimized instead.
import hosts from './imageHosts.json';

interface RemotePattern {
    protocol: string;
    hostname: string;
}

export const IMAGE_REMOTE_PATTERNS: readonly RemotePattern[] = hosts;

const WILDCARD_PREFIX = '*.';

function hostMatches(pattern: string, hostname: string): boolean {
    if (!pattern.startsWith(WILDCARD_PREFIX)) return pattern === hostname;
    const suffix = pattern.slice(1); // ".supabase.co"
    return hostname.endsWith(suffix) && hostname.length > suffix.length;
}

/** True when `src` is an absolute URL on one of the configured hosts (so next/image may optimize it). */
export function isOptimizableImageUrl(src: string): boolean {
    let url: URL;
    try {
        url = new URL(src);
    } catch {
        return false;
    }
    const protocol = url.protocol.replace(':', '');
    return IMAGE_REMOTE_PATTERNS.some((p) => p.protocol === protocol && hostMatches(p.hostname, url.hostname));
}
