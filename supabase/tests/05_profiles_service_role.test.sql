-- S8-PRIV (SEC-03, TEST-04): service_role cannot UPDATE profiles any more; the
-- paths that still write profiles keep working: users editing their own display
-- fields (authenticated, under RLS), profile creation (service_role INSERT) and
-- ratings through public.apply_game_result (security definer).
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

-- Fixtures (as the migration role) -------------------------------------------
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice@example.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bob@example.test'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'carol@example.test');

insert into public.profiles
  (id, username, display_name, rating_rapid, rating_rd, rating_vol, games_played, wins, losses, draws)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice', 'Alice', 1200, 100, 0.06, 10, 4, 5, 1),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bob',   'Bob',   1500,  80, 0.06, 20, 10, 8, 2);

insert into public.games (id, white_id, black_id, time_control, status, result, is_rated) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '10', 'completed', 'white', true);

-- ================================ privileges =================================
select ok(
  not has_table_privilege('service_role', 'public.profiles', 'UPDATE'),
  'service_role has no table-level UPDATE on profiles'
);
select is_empty(
  $$ select a.attname from pg_catalog.pg_attribute a
     where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped
       and has_column_privilege('service_role', 'public.profiles', a.attname, 'UPDATE') $$,
  'service_role cannot UPDATE any single column of profiles either'
);
select ok(
  has_table_privilege('service_role', 'public.profiles', 'SELECT')
    and has_table_privilege('service_role', 'public.profiles', 'INSERT'),
  'service_role keeps SELECT and INSERT (signup, OAuth, auto-create)'
);

-- ============================== as service_role ==============================
set local role service_role;
select throws_ok(
  $$ update public.profiles set rating_rapid = 3000 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '42501', null, 'the secret key cannot rewrite a rating'
);
select throws_ok(
  $$ update public.profiles set display_name = 'x' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '42501', null, 'the secret key cannot change display fields either'
);
select lives_ok(
  $$ insert into public.profiles (id, username) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'carol') $$,
  'service_role can still INSERT a profile'
);
select is(
  public.apply_game_result(
    '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'white', 'rating_rapid',
    '{"old_rating":1200,"old_rd":100,"old_vol":0.06,"old_games_played":10,"new_rating":1232,"new_rd":95.5,"new_vol":0.0599}',
    '{"old_rating":1500,"old_rd":80,"old_vol":0.06,"old_games_played":20,"new_rating":1480,"new_rd":78.25,"new_vol":0.0601}'),
  'applied',
  'the game server still rates through apply_game_result (security definer)'
);
reset role;

select results_eq(
  $$ select rating_rapid::int, games_played, wins from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  $$ values (1232, 11, 5) $$,
  'the rating and statistics written by apply_game_result landed'
);

-- ============================ as the user (PATCH) ============================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select lives_ok(
  $$ update public.profiles set display_name = 'Alice A.', bio = 'hi' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  'a user still edits their own display fields (the PATCH /api/profile/me path)'
);
select throws_ok(
  $$ update public.profiles set rating_rapid = 3000 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '42501', null, '...and still cannot touch their rating'
);
select is_empty(
  $$ update public.profiles set bio = 'hacked' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' returning id $$,
  '...or anyone else''s row'
);
reset role;

select results_eq(
  $$ select display_name, bio, rating_rapid::int from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  $$ values ('Alice A.'::text, 'hi'::text, 1232) $$,
  'only the display fields changed'
);

select * from finish();
rollback;
