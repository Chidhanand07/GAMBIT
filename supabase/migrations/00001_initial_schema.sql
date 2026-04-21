-- 00001_initial_schema.sql

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles Table
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users NOT NULL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  rating_bullet DECIMAL(5,2) DEFAULT 1200.00,
  rating_blitz DECIMAL(5,2) DEFAULT 1200.00,
  rating_rapid DECIMAL(5,2) DEFAULT 1200.00,
  rating_classical DECIMAL(5,2) DEFAULT 1200.00,
  games_played INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  draws INTEGER DEFAULT 0,
  accuracy_rating DECIMAL(5,2) DEFAULT NULL,
  accuracy_rating_blitz DECIMAL(5,2) DEFAULT NULL,
  accuracy_rating_rapid DECIMAL(5,2) DEFAULT NULL,
  accuracy_rating_bullet DECIMAL(5,2) DEFAULT NULL,
  peak_accuracy_rating DECIMAL(5,2) DEFAULT NULL,
  total_moves_analysed INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Games Table
CREATE TABLE public.games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  white_id UUID REFERENCES public.profiles(id),
  black_id UUID REFERENCES public.profiles(id),
  time_control TEXT NOT NULL,
  increment INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'waiting', -- waiting, active, completed, aborted
  result TEXT, -- draw, white_wins, black_wins
  winner_id UUID REFERENCES public.profiles(id),
  pgn TEXT,
  final_fen TEXT,
  white_clock_ms INTEGER,
  black_clock_ms INTEGER,
  white_accuracy DECIMAL(5,2),
  black_accuracy DECIMAL(5,2),
  white_move_classifications JSONB,
  black_move_classifications JSONB,
  critical_moments JSONB,
  invite_token VARCHAR(12) UNIQUE,
  invite_expires_at TIMESTAMPTZ,
  is_rated BOOLEAN DEFAULT true,
  spectator_count INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Moves Table
CREATE TABLE public.moves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES public.games(id) ON DELETE CASCADE,
  move_number INTEGER NOT NULL,
  color TEXT NOT NULL,
  uci TEXT NOT NULL,
  san TEXT NOT NULL,
  fen_after TEXT NOT NULL,
  clock_ms_remaining INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages Table
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES public.games(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Matchmaking Queue Table
CREATE TABLE public.matchmaking_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) UNIQUE,
  time_control TEXT NOT NULL,
  increment INTEGER NOT NULL,
  rating DECIMAL(5,2) NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT NOW()
);

-- Friendships Table
CREATE TABLE public.friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  addressee_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, accepted, declined, blocked
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(requester_id, addressee_id)
);

-- Notifications Table
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- friend_request, friend_accepted, game_invite, game_started, game_result
  payload JSONB,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ROW LEVEL SECURITY (RLS) --
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Profiles: Anyone can read, users can update their own
CREATE POLICY "Public profiles are viewable by everyone." 
ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Users can update own profile." 
ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Games: Anyone can read
CREATE POLICY "Games are viewable by everyone." 
ON public.games FOR SELECT USING (true);

-- Moves: Anyone can read
CREATE POLICY "Moves are viewable by everyone." 
ON public.moves FOR SELECT USING (true);

-- Messages: Only participants can read
CREATE POLICY "Messages are viewable by game participants." 
ON public.messages FOR SELECT USING (
  auth.uid() IN (
    SELECT white_id FROM public.games WHERE id = game_id 
    UNION 
    SELECT black_id FROM public.games WHERE id = game_id
  )
);

-- Friendships: Visible to requester or addressee
CREATE POLICY "Friendships visible to participants" 
ON public.friendships FOR SELECT USING (
  auth.uid() = requester_id OR auth.uid() = addressee_id
);

-- Notifications: Visible to owner
CREATE POLICY "Notifications visible to owner" 
ON public.notifications FOR SELECT USING (
  auth.uid() = user_id
);
CREATE POLICY "Users can update own notifications" 
ON public.notifications FOR UPDATE USING (
  auth.uid() = user_id
);

-- Storage (if needed for avatars)
-- insert storage policies when bucket is created.
