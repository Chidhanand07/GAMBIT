// In-app links built from user-controlled names and ids. Every segment is URI-encoded so a
// name can never add a path segment or a query string (F12).

export const profileHref = (username: string): string => `/profile/${encodeURIComponent(username)}`;

export const challengeHref = (username: string): string => `/challenge/${encodeURIComponent(username)}`;

export const gameHref = (gameId: string): string => `/game/${encodeURIComponent(gameId)}`;
