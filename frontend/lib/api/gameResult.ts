// Client-side fetch helper for the game review page.

/** GET /api/games/:id — called with no options, exactly as the review page always has. */
export function fetchGameForReview(gameId: string): Promise<Response> {
    return fetch(`/api/games/${gameId}`);
}
