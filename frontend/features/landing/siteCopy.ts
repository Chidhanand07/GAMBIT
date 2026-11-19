// The landing's search and share copy (title, description), shared by the page metadata, the
// Open Graph / Twitter images and the structured data so they never disagree (F-114).

export const SITE_NAME = 'Gambit';
export const SITE_TAGLINE = 'Chess, perfected.';
export const LANDING_TITLE = `${SITE_NAME} · ${SITE_TAGLINE}`;
export const LANDING_DESCRIPTION =
    'Free online chess with real-time matchmaking, Glicko-2 ratings per time control, Stockfish analysis and an accuracy score after every game.';
/** Alt text of the share image (app/opengraph-image.tsx, app/twitter-image.tsx). */
export const SHARE_IMAGE_ALT = `${SITE_NAME}: ${SITE_TAGLINE} Free online chess.`;
