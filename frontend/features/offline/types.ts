import type { LucideIcon } from 'lucide-react';
import type { MaverickDifficulty } from '@/lib/api/offline';

export type Difficulty = MaverickDifficulty;
export type Side = 'w' | 'b';
export type ColorChoice = Side | 'random';
export type Phase = 'setup' | 'playing';

export interface LastMove {
    from: string;
    to: string;
}

export interface DifficultyOption {
    id: Difficulty;
    label: string;
    desc: string;
    Icon: LucideIcon;
}
