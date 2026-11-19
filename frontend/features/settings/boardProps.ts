// The user's board preferences as props of components/chess/Board: theme, animation and
// coordinates always; the last-move tint and legal-move dots only when their setting is on.
import type { BoardMove, BoardProps } from '@/components/chess/Board';
import type { BoardPrefs } from './model';

export interface BoardMarks {
    lastMove?: BoardMove | null;
    legalDestinations?: BoardProps['legalDestinations'];
}

export type PreferredBoardProps = Pick<
    BoardProps,
    'theme' | 'animate' | 'showCoordinates' | 'lastMove' | 'legalDestinations'
>;

/** `<Board {...preferredBoardProps(prefs, { lastMove, legalDestinations })} … />` */
export function preferredBoardProps(prefs: BoardPrefs, marks: BoardMarks = {}): PreferredBoardProps {
    return {
        theme: prefs.theme,
        animate: prefs.animate,
        showCoordinates: prefs.showCoordinates,
        lastMove: prefs.highlightLastMove ? (marks.lastMove ?? null) : null,
        legalDestinations: prefs.highlightLegalMoves ? marks.legalDestinations : undefined,
    };
}
