// The analysis board opened on a finished game (/analysis?game=<id>, F-134). The id is URI-encoded
// so it can never add a query parameter or a path segment (F12).

export const analysisGameHref = (gameId: string): string => `/analysis?game=${encodeURIComponent(gameId)}`;
