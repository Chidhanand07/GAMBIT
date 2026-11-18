import { render, screen } from '@testing-library/react';
import { GamesTab } from '@/features/profile/components/GamesTab';
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
