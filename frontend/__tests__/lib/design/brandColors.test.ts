import fs from 'node:fs';
import path from 'node:path';
import { BRAND_COLORS } from '@/lib/design/brandColors';

test('[F-114] the share-image and icon colours equal the app/globals.css tokens', () => {
    const css = fs.readFileSync(path.join(__dirname, '../../../app/globals.css'), 'utf8');
    for (const [name, hex] of Object.entries(BRAND_COLORS)) {
        const match = css.match(new RegExp(`--color-${name}:\\s*(#[0-9A-Fa-f]{6})`));
        expect([name, match?.[1]?.toUpperCase()]).toEqual([name, hex.toUpperCase()]);
    }
});
