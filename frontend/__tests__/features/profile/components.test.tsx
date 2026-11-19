import { render, screen } from '@testing-library/react';
import { GamesTab } from '@/features/profile/components/GamesTab';
import { EndingsCard } from '@/features/profile/components/EndingsCard';
import { OpeningsCard } from '@/features/profile/components/OpeningsCard';
import type { ProfileGameRow } from '@/types/profilePage';

const ME = 'me';
const game = (over: Partial<ProfileGameRow> = {}): ProfileGameRow => ({
    id: 'g1',
    time_control: '3+0',
    status: 'completed',
    result: 'white',
    winner_id: ME,
    white_accuracy: 81,
    black_accuracy: 70,
    created_at: '2026-04-21T10:00:00Z',
    ended_at: '2026-04-21T10:10:00Z',
    white_id: ME,
    black_id: 'opp',
    white: { username: 'me', rating_blitz: 1239 },
    black: { username: 'raju', rating_blitz: 1300 },
    ...over,
});

function renderGames(games: ProfileGameRow[]) {
    return render(
        <GamesTab
            profileId={ME}
            total={games.length}
            games={games}
            shown={games}
            filter="All"
            onFilter={() => {}}
            loading={false}
            hasMore={false}
            onLoadMore={() => {}}
        />,
    );
}

describe('GamesTab rows [F-120]', () => {
    test('a rated game shows the rating change and the opponent rating at the start', () => {
        renderGames([
            game({ white_rating_before: 1231, white_rating_after: 1239, black_rating_before: 1250, black_rating_after: 1242 }),
        ]);
        expect(screen.getByText('+8 · Apr 21, 2026')).toBeInTheDocument();
        expect(screen.getByText('(1250)')).toBeInTheDocument();
    });

    test('a game without a snapshot shows the date only', () => {
        renderGames([game()]);
        expect(screen.getByText('Apr 21, 2026')).toBeInTheDocument();
        expect(screen.getByText('(1300)')).toBeInTheDocument();
    });
});

describe('GamesTab openings [F-123]', () => {
    test('the opening leads the details line when known', () => {
        renderGames([game({ opening: "King's Gambit" })]);
        expect(screen.getByText("King's Gambit · 3 min")).toBeInTheDocument();
    });
});

describe('OpeningsCard [F-123]', () => {
    test('one row per opening: games, win rate coloured by band, accuracy or a dash', () => {
        render(
            <OpeningsCard
                openings={[
                    { name: "King's Gambit", games: 15, winRate: 73, accuracy: 81 },
                    { name: 'Sicilian Defense', games: 8, winRate: 50, accuracy: null },
                    { name: 'Other', games: 1, winRate: 0, accuracy: 65 },
                ]}
            />,
        );
        expect(screen.getByText("King's Gambit")).toBeInTheDocument();
        expect(screen.getByText('73%')).toHaveClass('text-success');
        expect(screen.getByText('50%')).toHaveClass('text-ink');
        expect(screen.getByText('0%')).toHaveClass('text-danger');
        expect(screen.getByText('—')).toBeInTheDocument();
        expect(screen.getByText('65%')).toBeInTheDocument();
    });
});

describe('game length and endings [F-124]', () => {
    test('a Games-tab row ends its details line with the number of moves', () => {
        renderGames([game({ opening: 'Italian Game', move_count: 24 })]);
        expect(screen.getByText('Italian Game · 3 min · 24 moves')).toBeInTheDocument();
    });

    test('How games end: name, count and a bar as wide as the share', () => {
        const { container } = render(
            <EndingsCard
                rows={[
                    { name: 'Checkmate', n: 11, pct: '34%' },
                    { name: 'Not recorded', n: 3, pct: '9%' },
                ]}
            />,
        );
        expect(screen.getByText('How games end')).toBeInTheDocument();
        expect(screen.getByText('Checkmate').nextSibling).toHaveTextContent('11');
        expect(screen.getByText('Not recorded')).toBeInTheDocument();
        expect(container.querySelector('[style="width: 34%;"]')).not.toBeNull();
    });
});
