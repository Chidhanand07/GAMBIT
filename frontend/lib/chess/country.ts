// The two-letter chip shown next to a player (Game.dc.html "IN") from the free-text
// profiles.country ("India"). Pure apart from Intl, which every supported runtime has.

const CODE = /^[A-Za-z]{2}$/;
const LETTER_A = 65;
const LETTERS = 26;

/** Common names Intl does not use for the region. */
const ALIASES: Readonly<Record<string, string>> = {
    usa: 'US',
    'united states of america': 'US',
    america: 'US',
    uk: 'GB',
    england: 'GB',
    scotland: 'GB',
    wales: 'GB',
    'great britain': 'GB',
    holland: 'NL',
    uae: 'AE',
};

let byName: Map<string, string> | null = null;

/** False for replaced codes that still have a name: DD (→ DE), UK (→ GB), YU, ZR, … */
const isCurrentCode = (code: string) => Intl.getCanonicalLocales(`und-${code}`)[0] === `und-${code}`;

/** The English name of a region code, or undefined when Intl has none. */
function nameOf(names: Intl.DisplayNames, code: string): string | undefined {
    try {
        const name = names.of(code);
        return name && name !== code ? name : undefined;
    } catch {
        return undefined;
    }
}

/** English region name (lower case) → ISO 3166-1 alpha-2 code, built once from Intl. */
function regionNames(): Map<string, string> {
    if (byName) return byName;
    byName = new Map();
    const names = new Intl.DisplayNames(['en'], { type: 'region' });
    for (let a = 0; a < LETTERS; a++) {
        for (let b = 0; b < LETTERS; b++) {
            const code = String.fromCharCode(LETTER_A + a, LETTER_A + b);
            const key = isCurrentCode(code) ? nameOf(names, code)?.toLowerCase() : undefined;
            if (key && !byName.has(key)) byName.set(key, code);
        }
    }
    return byName;
}

/** "India" → "IN", "in" → "IN", "USA" → "US"; null when the text names no known country. */
export function countryCode(country: string | null | undefined): string | null {
    const text = country?.trim();
    if (!text) return null;
    const alias = ALIASES[text.toLowerCase()];
    if (alias) return alias;
    if (CODE.test(text)) return text.toUpperCase();
    return regionNames().get(text.toLowerCase()) ?? null;
}
