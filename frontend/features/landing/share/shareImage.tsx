import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { BRAND_COLORS as C } from '@/lib/design/brandColors';
import { SITE_NAME, SITE_TAGLINE } from '../siteCopy';
import { KnightArt, LogoTileArt } from './KnightArt';

// The Open Graph / Twitter card (F-114): the page background, the logo tile and wordmark, the
// "Chess, perfected." headline and the splash knight, in the design's fonts and colours.

export const SHARE_IMAGE_SIZE = { width: 1200, height: 630 } as const;
export const SHARE_IMAGE_TYPE = 'image/png';

/** Subsets of the page fonts, committed with their licences (assets/fonts). */
const FONT_DIR = path.join(process.cwd(), 'assets', 'fonts');

async function shareFonts() {
    const [display, body] = await Promise.all([
        readFile(path.join(FONT_DIR, 'SpaceGrotesk-Bold.ttf')),
        readFile(path.join(FONT_DIR, 'Inter-Medium.ttf')),
    ]);
    return [
        { name: 'Space Grotesk', data: display, weight: 700 as const, style: 'normal' as const },
        { name: 'Inter', data: body, weight: 500 as const, style: 'normal' as const },
    ];
}

const BACKGROUND = [
    `radial-gradient(circle at 10% 0%, rgba(239,191,91,0.16), rgba(239,191,91,0) 55%)`,
    `radial-gradient(circle at 100% 40%, rgba(52,138,98,0.34), rgba(52,138,98,0) 60%)`,
    `linear-gradient(180deg, ${C['bg-gradient-top']} 0%, ${C['bg-deep']} 100%)`,
].join(', ');

function Brand() {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <LogoTileArt size={72} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontFamily: 'Space Grotesk', fontSize: 40, letterSpacing: '-0.02em', color: C.ink }}>
                    {SITE_NAME}
                </span>
                <span style={{ fontFamily: 'Inter', fontSize: 22, color: C['ink-muted'] }}>{SITE_TAGLINE}</span>
            </div>
        </div>
    );
}

function Headline() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    fontFamily: 'Space Grotesk',
                    fontSize: 112,
                    lineHeight: 0.98,
                    letterSpacing: '-0.04em',
                }}
            >
                <span style={{ color: C.ink }}>Chess,</span>
                <span style={{ color: C.accent }}>perfected.</span>
            </div>
            <span style={{ fontFamily: 'Inter', fontSize: 28, color: C['ink-muted'] }}>
                Free online chess · real-time matchmaking · engine analysis
            </span>
        </div>
    );
}

/** The 1200×630 share card. */
export async function renderShareImage(): Promise<ImageResponse> {
    return new ImageResponse(
        <div
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '72px 88px',
                backgroundColor: C['bg-base'],
                backgroundImage: BACKGROUND,
            }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
                <Brand />
                <Headline />
            </div>
            <KnightArt width={300} height={360} body={C.accent} eye={C['bg-deep']} />
        </div>,
        { ...SHARE_IMAGE_SIZE, fonts: await shareFonts() },
    );
}
