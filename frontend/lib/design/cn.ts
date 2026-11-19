// className helper for the redesign components: clsx, then tailwind-merge taught the custom
// token names in tailwind.config.ts so a caller's class replaces a default instead of racing it.
import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const merge = extendTailwindMerge({
    extend: {
        theme: { borderRadius: ['3', '4', '10', '12', '14', '16', '20', '24', '28', 'pill'] },
        classGroups: { 'font-size': [{ text: ['body'] }] },
    },
});

export function cn(...inputs: ClassValue[]): string {
    return merge(clsx(inputs));
}
