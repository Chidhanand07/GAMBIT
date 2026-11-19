-- B1 item 8 (F-127; SEC-03, SEC-04, NX-07): the public-profile fields the design shows.
--
-- Profile.dc.html (hero chips, About card) and Settings.dc.html (Public profile form) show a city,
-- a website, a favourite opening and player, pronouns, a playing style and an experience level.
-- None of them existed.
--
-- Columns (all optional, NULL = not set), each with a CHECK so the database refuses what the API's
-- zod schema refuses (lib/profile/fields.ts holds the same limits and lists):
--   city              1..60 characters
--   website           an https:// URL without whitespace, at most 200 characters
--   favorite_opening  1..80 characters
--   favorite_player   1..60 characters
--   pronouns          he/him | she/her | they/them
--   playing_style     aggressive | positional | tactical | balanced
--   experience        beginner | improving | club | tournament
--
-- Privileges (F-017 / F-086 pattern): `authenticated` gets UPDATE on exactly these columns; the
-- "profiles_update" policy limits it to the caller's own row. PATCH /api/profile/me writes them
-- through the caller's session client. Nobody else gets anything (service_role has no UPDATE on
-- profiles since F-086; SELECT is table-wide already, so the columns are readable like the others).
--
-- Deploy order: this migration first, then the web app that sends the fields (the old web app
-- never names them). Rollback: drop the seven columns.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS city             text,
  ADD COLUMN IF NOT EXISTS website          text,
  ADD COLUMN IF NOT EXISTS favorite_opening text,
  ADD COLUMN IF NOT EXISTS favorite_player  text,
  ADD COLUMN IF NOT EXISTS pronouns         text,
  ADD COLUMN IF NOT EXISTS playing_style    text,
  ADD COLUMN IF NOT EXISTS experience       text;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_city_check
    CHECK (city IS NULL OR char_length(city) BETWEEN 1 AND 60),
  ADD CONSTRAINT profiles_website_check
    CHECK (website IS NULL OR (char_length(website) <= 200 AND website ~ '^https://[^[:space:]/?#]+[^[:space:]]*$')),
  ADD CONSTRAINT profiles_favorite_opening_check
    CHECK (favorite_opening IS NULL OR char_length(favorite_opening) BETWEEN 1 AND 80),
  ADD CONSTRAINT profiles_favorite_player_check
    CHECK (favorite_player IS NULL OR char_length(favorite_player) BETWEEN 1 AND 60),
  ADD CONSTRAINT profiles_pronouns_check
    CHECK (pronouns IS NULL OR pronouns IN ('he/him', 'she/her', 'they/them')),
  ADD CONSTRAINT profiles_playing_style_check
    CHECK (playing_style IS NULL OR playing_style IN ('aggressive', 'positional', 'tactical', 'balanced')),
  ADD CONSTRAINT profiles_experience_check
    CHECK (experience IS NULL OR experience IN ('beginner', 'improving', 'club', 'tournament'));

GRANT UPDATE (city, website, favorite_opening, favorite_player, pronouns, playing_style, experience)
  ON TABLE public.profiles TO authenticated;
