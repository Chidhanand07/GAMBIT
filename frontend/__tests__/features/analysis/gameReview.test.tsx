import { render, screen, waitFor, within } from '@testing-library/react';
import AnalysisPage from '@/app/analysis/page';
import { classificationSummary } from '@/features/analysis/components/GameReviewPanel';
import { gameIdFrom } from '@/features/analysis/components/AnalysisRoute';
import { routeParams } from '../../helpers/params';
import { jsonResponse } from '../../characterization/fakeSocket';

const GAME = {
    id: 'g1',
    pgn: '1. e4 e5 2. Nf3',
    white: {
        name: 'Alice',
        accuracy: 87.25,
        moves: [
            { ply: 0, san: 'e4', classification: 'Book', accuracy: 100 },
            { ply: 2, san: 'Nf3', classification: 'Best', accuracy: 98 },
        ],
    },
    black: { name: 'bob', accuracy: null, moves: [] },
};

let fetchMock: jest.Mock;
beforeEach(() => {
    fetchMock = jest.fn(async (url: string) =>
        url === '/api/games/g1/analysis' ? jsonResponse(GAME) : jsonResponse({ error: 'Game not found' }, false),
    );
    (global as any).fetch = fetchMock;
});
afterEach(() => jest.restoreAllMocks());

describe('/analysis?game=<id> [F-134]', () => {
    test("loads the game: its moves on the board, each side's accuracy and classifications", async () => {
        render(<AnalysisPage searchParams={routeParams({ game: 'g1' })} />);
        expect(screen.getByText('Loading the game…')).toBeInTheDocument();
        const review = await screen.findByRole('region', { name: 'Game review' });
        expect(fetchMock).toHaveBeenCalledWith('/api/games/g1/analysis');
        expect(review).toHaveTextContent('Alice');
        expect(review).toHaveTextContent('87.3%');
        expect(review).toHaveTextContent('Best 1 · Book 1');
        expect(review).toHaveTextContent('bob');
        expect(review).toHaveTextContent('—');
        const moves = within(screen.getByRole('region', { name: 'Moves' }));
        await waitFor(() => expect(moves.getByText('Nf3')).toBeInTheDocument());
    });

    test('a game that cannot be shown says why', async () => {
        render(<AnalysisPage searchParams={routeParams({ game: 'other' })} />);
        expect(await screen.findByRole('alert')).toHaveTextContent('Game not found');
    });

    test('signed out: asked to sign in', async () => {
        fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: 'Not authenticated' }) })
        render(<AnalysisPage searchParams={routeParams({ game: 'g1' })} />)
        expect(await screen.findByRole('alert')).toHaveTextContent('Sign in to open this game.')
    })

    test('without ?game= nothing is fetched and no review is shown', () => {
        render(<AnalysisPage searchParams={routeParams({})} />);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(screen.queryByRole('region', { name: 'Game review' })).toBeNull();
    });

    test('gameIdFrom takes one non-empty value only', () => {
        expect(gameIdFrom({ game: 'g1' })).toBe('g1');
        expect(gameIdFrom({ game: ['a', 'b'] })).toBeNull();
        expect(gameIdFrom({ game: '' })).toBeNull();
        expect(gameIdFrom({})).toBeNull();
    });

    test('classificationSummary counts in the review order', () => {
        expect(classificationSummary(GAME.white)).toBe('Best 1 · Book 1');
        expect(classificationSummary(GAME.black)).toBe('');
    });
});
