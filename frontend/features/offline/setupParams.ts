// The MAVERICK setup carried in the /offline URL, so the lobby's "Play MAVERICK" card can
// start a game directly: /offline?difficulty=<easy|medium|hard>&side=<w|b|random>.
import type { ColorChoice, Difficulty } from './types';

export const OFFLINE_PATH = '/offline';

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];
const SIDES: readonly ColorChoice[] = ['w', 'b', 'random'];

export interface ComputerSetup {
    difficulty: Difficulty;
    colorChoice: ColorChoice;
}

interface ParamReader {
    get(name: string): string | null;
}

const oneOf = <T extends string>(list: readonly T[], value: string | null): T | null =>
    list.includes(value as T) ? (value as T) : null;

/** The setup in the query, or null unless both values are valid (then the setup screen shows). */
export function parseComputerSetup(params: ParamReader | null): ComputerSetup | null {
    if (!params) return null;
    const difficulty = oneOf(DIFFICULTIES, params.get('difficulty'));
    const colorChoice = oneOf(SIDES, params.get('side'));
    return difficulty && colorChoice ? { difficulty, colorChoice } : null;
}

/** `/offline?difficulty=…&side=…` for a setup. */
export function computerSetupHref({ difficulty, colorChoice }: ComputerSetup): string {
    return `${OFFLINE_PATH}?${new URLSearchParams({ difficulty, side: colorChoice }).toString()}`;
}
