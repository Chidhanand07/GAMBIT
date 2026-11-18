import type { MaverickDifficulty } from '@/lib/api/offline';

export type Difficulty = MaverickDifficulty;
export type Side = 'w' | 'b';
export type ColorChoice = Side | 'random';
export type Phase = 'setup' | 'playing';

export interface LastMove {
    from: string;
    to: string;
}
