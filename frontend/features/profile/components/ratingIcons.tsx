import { BookOpen, Flame, Timer, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import type { SpeedBucket } from '@/types/timeControl';

export const RATING_ICONS: Record<SpeedBucket, ReactNode> = {
    bullet: <Zap size={14} strokeWidth={1.5} />,
    blitz: <Flame size={14} strokeWidth={1.5} />,
    rapid: <Timer size={14} strokeWidth={1.5} />,
    classical: <BookOpen size={14} strokeWidth={1.5} />,
};
