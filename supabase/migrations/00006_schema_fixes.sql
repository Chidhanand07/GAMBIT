-- D3: Add missing columns to profiles
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS rating_rd      FLOAT   DEFAULT 350,
    ADD COLUMN IF NOT EXISTS rating_vol     FLOAT   DEFAULT 0.06,
    ADD COLUMN IF NOT EXISTS display_name   TEXT,
    ADD COLUMN IF NOT EXISTS bio            TEXT,
    ADD COLUMN IF NOT EXISTS country        TEXT;

-- D1: Add missing columns to games
ALTER TABLE public.games
    ADD COLUMN IF NOT EXISTS fen                        TEXT,
    ADD COLUMN IF NOT EXISTS white_time_ms              INTEGER,
    ADD COLUMN IF NOT EXISTS black_time_ms              INTEGER,
    ADD COLUMN IF NOT EXISTS clock_deadline             TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS invite_token               TEXT,
    ADD COLUMN IF NOT EXISTS invite_expires_at          TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS is_rated                   BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS result                     TEXT,
    ADD COLUMN IF NOT EXISTS winner_id                  UUID REFERENCES public.profiles(id),
    ADD COLUMN IF NOT EXISTS ended_at                   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS white_accuracy             FLOAT,
    ADD COLUMN IF NOT EXISTS black_accuracy             FLOAT,
    ADD COLUMN IF NOT EXISTS white_move_classifications JSONB,
    ADD COLUMN IF NOT EXISTS black_move_classifications JSONB,
    ADD COLUMN IF NOT EXISTS critical_moments           JSONB;

-- D2: Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_games_white_id       ON public.games(white_id);
CREATE INDEX IF NOT EXISTS idx_games_black_id       ON public.games(black_id);
CREATE INDEX IF NOT EXISTS idx_games_status         ON public.games(status);
CREATE INDEX IF NOT EXISTS idx_games_invite_token   ON public.games(invite_token) WHERE invite_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_games_started_at     ON public.games(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_created_at     ON public.games(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_username    ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_rating_rapid ON public.profiles(rating_rapid DESC);
CREATE INDEX IF NOT EXISTS idx_friendships_requester ON public.friendships(requester_id) WHERE status = 'accepted';
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON public.friendships(addressee_id) WHERE status = 'accepted';
