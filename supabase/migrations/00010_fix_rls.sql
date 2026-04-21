-- 00010_fix_rls.sql
-- Resets all RLS policies on profiles to a clean, non-conflicting state.
-- Run this in Supabase Dashboard → SQL Editor.

ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "allow_insert_own_profile" ON profiles;
DROP POLICY IF EXISTS "Profiles are publicly readable" ON profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON profiles;
DROP POLICY IF EXISTS "allow_select_all_profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile." ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "allow_update_own_profile" ON profiles;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Allow anyone (including service role) to insert profiles
CREATE POLICY "profiles_insert" ON profiles FOR INSERT
  WITH CHECK (true);

-- Allow anyone to read profiles (for leaderboard, search, friend lookup)
CREATE POLICY "profiles_select" ON profiles FOR SELECT
  USING (true);

-- Only authenticated users can update their own profile
CREATE POLICY "profiles_update" ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Ensure all columns have safe defaults so inserts don't fail silently
ALTER TABLE profiles
  ALTER COLUMN rating_bullet    SET DEFAULT 1200,
  ALTER COLUMN rating_blitz     SET DEFAULT 1200,
  ALTER COLUMN rating_rapid     SET DEFAULT 1200,
  ALTER COLUMN rating_classical SET DEFAULT 1200,
  ALTER COLUMN games_played     SET DEFAULT 0,
  ALTER COLUMN wins             SET DEFAULT 0,
  ALTER COLUMN losses           SET DEFAULT 0,
  ALTER COLUMN draws            SET DEFAULT 0,
  ALTER COLUMN total_moves_analysed SET DEFAULT 0;
