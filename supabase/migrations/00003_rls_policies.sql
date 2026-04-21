-- Allow users to insert their own profile on signup
CREATE POLICY "Users can insert own profile"
ON profiles FOR INSERT
WITH CHECK (auth.uid() = id);

-- Allow users to read any profile (for leaderboard/search)
CREATE POLICY "Profiles are publicly readable"
ON profiles FOR SELECT
USING (true);

-- Allow users to update only their own profile
CREATE POLICY "allow_update_own_profile"
ON profiles FOR UPDATE
USING (auth.uid() = id);

-- Ensure all required columns have default values so inserts don't fail silently
ALTER TABLE profiles 
ALTER COLUMN rating_bullet SET DEFAULT 1200,
ALTER COLUMN rating_blitz SET DEFAULT 1200,
ALTER COLUMN rating_rapid SET DEFAULT 1200,
ALTER COLUMN rating_classical SET DEFAULT 1200,
ALTER COLUMN games_played SET DEFAULT 0,
ALTER COLUMN wins SET DEFAULT 0,
ALTER COLUMN losses SET DEFAULT 0,
ALTER COLUMN draws SET DEFAULT 0;
