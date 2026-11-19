-- SETTINGS-PREFS (ADR F-140; SEC-03, TEST-04): a user reads and writes only their own
-- preferences row and only its preference columns; anon sees nothing; service_role can
-- only read; the leaderboard view leaves out players who opted out.
begin;
create extension if not exists pgtap with schema extensions;

select plan(25);

-- Fixtures (as the migration role; RLS does not apply to it) -------------------
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice@example.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bob@example.test');
insert into public.profiles (id, username) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bob');
insert into public.user_preferences (user_id, show_on_leaderboard, challenge_policy)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false, 'friends');

-- ================================ structure ==================================
select has_table('public', 'user_preferences', 'user_preferences exists');
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.user_preferences'::regclass),
  'RLS is on'
);
select is_empty(
  $$ select policyname from pg_catalog.pg_policies
     where schemaname = 'public' and tablename = 'user_preferences' and cmd in ('DELETE', 'ALL') $$,
  'no DELETE (or ALL) policy: users cannot delete their row through the API'
);
select ok(
  not has_table_privilege('anon', 'public.user_preferences', 'SELECT'),
  'anon cannot read preferences'
);
select ok(
  not has_column_privilege('authenticated', 'public.user_preferences', 'user_id', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.user_preferences', 'updated_at', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.user_preferences', 'created_at', 'INSERT'),
  'authenticated cannot move a row to another user or forge its timestamps'
);
select ok(
  has_table_privilege('service_role', 'public.user_preferences', 'SELECT')
    and not has_table_privilege('service_role', 'public.user_preferences', 'INSERT')
    and not has_table_privilege('service_role', 'public.user_preferences', 'UPDATE')
    and not has_table_privilege('service_role', 'public.user_preferences', 'DELETE'),
  'service_role only reads preferences'
);
select ok(
  not has_table_privilege('authenticated', 'public.leaderboard_profiles', 'SELECT')
    and not has_table_privilege('anon', 'public.leaderboard_profiles', 'SELECT')
    and has_table_privilege('service_role', 'public.leaderboard_profiles', 'SELECT'),
  'only service_role reads the leaderboard view'
);

-- ============================ authenticated: alice ===========================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);

select is((select count(*) from public.user_preferences), 0::bigint, 'alice cannot see bob''s row');
select lives_ok(
  $$ insert into public.user_preferences (user_id, notify_challenges, play)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false, '{"boardTheme":"green"}') $$,
  'alice creates her own row'
);
select throws_ok(
  $$ insert into public.user_preferences (user_id) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') $$,
  '42501', null, 'alice cannot create a row for bob'
);
select lives_ok(
  $$ update public.user_preferences set allow_spectators = false, challenge_policy = 'nobody'
     where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  'alice updates her own preferences'
);
select is(
  (select challenge_policy from public.user_preferences where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'nobody', 'the update was stored'
);
update public.user_preferences set show_online = false where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select throws_ok(
  $$ update public.user_preferences set user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
     where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '42501', null, 'alice cannot re-key her row'
);
select throws_ok(
  $$ update public.user_preferences set challenge_policy = 'strangers'
     where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '23514', null, 'challenge_policy only takes everyone / friends / nobody'
);
select throws_ok(
  $$ update public.user_preferences set play = '[1,2]'
     where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '23514', null, 'play must be a JSON object'
);
select throws_ok(
  $$ update public.user_preferences set play = jsonb_build_object('x', repeat('y', 10000))
     where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '23514', null, 'play is size-bounded'
);
select throws_ok(
  $$ delete from public.user_preferences where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '42501', null, 'alice cannot delete her row through the API'
);
select throws_ok(
  $$ delete from public.leaderboard_profiles $$,
  '42501', null, 'authenticated cannot touch the leaderboard view'
);
reset role;

select is(
  (select show_online from public.user_preferences where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  true, 'alice''s update of bob''s row changed nothing'
);
select is(
  (select count(*) from public.user_preferences where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  1::bigint, 'alice''s row is still there'
);

-- =================================== anon ====================================
set local role anon;
select throws_ok(
  $$ select * from public.user_preferences $$, '42501', null, 'anon cannot read preferences'
);
reset role;

-- =============================== service_role ================================
set local role service_role;
select is(
  (select count(*) from public.user_preferences), 2::bigint, 'service_role reads every row (enforcement)'
);
select throws_ok(
  $$ update public.user_preferences set allow_spectators = true $$,
  '42501', null, 'service_role cannot write preferences'
);
select is(
  (select array_agg(username order by username) from public.leaderboard_profiles),
  array['alice']::text[], 'bob opted out of the leaderboard and is not listed'
);
reset role;

-- updated_at moves on every update.
update public.user_preferences set updated_at = '2000-01-01', notify_browser = true
  where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select ok(
  (select updated_at > '2000-01-02' from public.user_preferences where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'the trigger sets updated_at'
);

select * from finish();
rollback;
