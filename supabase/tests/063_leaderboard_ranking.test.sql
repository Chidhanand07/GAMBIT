-- F-125 (SEC-04, TEST-04): rated games per pool are counted only by apply_game_result, the "All"
-- rating is the best rating among the pools a player has played, and leaderboard_rank gives every
-- player their place in the list order (rating desc, username asc), beyond the top 50 too.
begin;
create extension if not exists pgtap with schema extensions;

select plan(26);

-- Fixtures (as the migration role) -------------------------------------------
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice@example.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bob@example.test'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'carol@example.test'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dave@example.test');

insert into public.profiles
  (id, username, rating_bullet, rating_blitz, rating_rapid, rating_classical, rating_rd, rating_vol, games_played,
   rated_games_bullet, rated_games_blitz, rated_games_rapid, rated_games_classical)
values
  -- alice: blitz 1300 played, bullet 1500 never played (the default-like value must not count)
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice', 1500, 1300, 1200, 1200, 100, 0.06, 3, 0, 3, 0, 0),
  -- bob: rapid 1400 and blitz 1250 played
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bob',   1200, 1250, 1400, 1200,  80, 0.06, 5, 0, 2, 3, 0),
  -- carol: rapid 1400 played (ties bob on All and on rapid)
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'carol', 1200, 1200, 1400, 1200, 100, 0.06, 1, 0, 0, 1, 0),
  -- dave: never played a rated game
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'dave',  1200, 1200, 1200, 1200, 350, 0.06, 0, 0, 0, 0, 0);

insert into public.games (id, white_id, black_id, time_control, status, result, is_rated) values
  ('11111111-1111-4111-8111-111111111111', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '1+0', 'completed', 'white', true),
  ('22222222-2222-4222-8222-222222222222', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '1+0', 'completed', 'draw',  false);

-- ================================== schema ===================================
select col_type_is('public', 'profiles', 'rated_games_blitz', 'integer', 'rated_games_* are integers');
select col_type_is('public', 'profiles', 'rating_all', 'numeric(7,2)', 'rating_all is numeric(7,2)');
select is(
  (select attgenerated::text from pg_catalog.pg_attribute
   where attrelid = 'public.profiles'::regclass and attname = 'rating_all'),
  's',
  'rating_all is a stored generated column'
);
select has_index('public', 'profiles', 'idx_profiles_board_all', 'the All board has its index');
select has_index('public', 'profiles', 'idx_profiles_board_rapid', 'each pool board has its index');
select throws_ok(
  $$ update public.profiles set rated_games_rapid = -1 where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' $$,
  '23514', null, 'a rated-game counter cannot go below zero'
);

-- ============================== the "All" rating ==============================
select results_eq(
  $$ select username, rating_all from public.profiles order by username $$,
  $$ values ('alice'::text, 1300.00::numeric), ('bob', 1400.00), ('carol', 1400.00), ('dave', null) $$,
  'All = best rating among the pools with a rated game; null before the first rated game'
);

-- ================================ privileges =================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}', true);
select throws_ok(
  $$ update public.profiles set rated_games_classical = 99 where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' $$,
  '42501', null, 'a user cannot raise their own rated-game counter'
);
select throws_ok(
  $$ select public.leaderboard_rank('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'all') $$,
  '42501', null, 'the browser roles cannot call leaderboard_rank'
);
reset role;
select ok(
  not has_function_privilege('anon', 'public.leaderboard_rank(uuid, text)', 'execute')
    and has_function_privilege('service_role', 'public.leaderboard_rank(uuid, text)', 'execute'),
  'leaderboard_rank is service-role only'
);
select ok(
  not has_column_privilege('service_role', 'public.profiles', 'rated_games_bullet', 'UPDATE'),
  'not even the secret key can write a counter directly'
);

-- ============================ apply_game_result ===============================
set local role service_role;
select is(
  public.apply_game_result(
    '11111111-1111-4111-8111-111111111111', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'white', 'rating_bullet',
    '{"old_rating":1200,"old_rd":350,"old_vol":0.06,"old_games_played":0,"new_rating":1450,"new_rd":250,"new_vol":0.06}',
    '{"old_rating":1500,"old_rd":100,"old_vol":0.06,"old_games_played":3,"new_rating":1480,"new_rd":98,"new_vol":0.06}'),
  'applied',
  'a rated bullet game is applied'
);
select is(
  public.apply_game_result(
    '22222222-2222-4222-8222-222222222222', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'draw'),
  'applied',
  'an unrated game is applied'
);
reset role;
select results_eq(
  $$ select rated_games_bullet, rated_games_blitz, rating_all from public.profiles where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' $$,
  $$ values (1, 0, 1450.00::numeric) $$,
  'dave: one rated bullet game counted (the unrated one is not), and he is now on the All board'
);
select results_eq(
  $$ select rated_games_bullet, rating_all from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  $$ values (1, 1480.00::numeric) $$,
  'alice: her bullet pool now counts, so All is her bullet 1480'
);

-- ================================= ranks ======================================
set local role service_role;
-- All: alice 1480, dave 1450, bob 1400, carol 1400 (bob before carol by username).
select is(public.leaderboard_rank('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'all'), 1, 'All: alice is first');
select is(public.leaderboard_rank('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'all'), 2, 'All: dave is second');
select is(public.leaderboard_rank('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'all'), 3, 'All: bob is third (tie, earlier username)');
select is(public.leaderboard_rank('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'all'), 4, 'All: carol is fourth (tie, later username)');
-- Rapid: bob 1400, carol 1400, alice 1200, dave 1200.
select is(public.leaderboard_rank('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'rapid'), 2, 'rapid: carol second');
select is(public.leaderboard_rank('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'rapid'), 4, 'rapid: dave last');
select is(
  public.leaderboard_rank('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'rapid'), null,
  'an unknown player has no rank'
);
select throws_ok(
  $$ select public.leaderboard_rank('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'rating_rapid; drop table x') $$,
  '22023', null, 'an unknown board is refused'
);
reset role;

-- A player with no "All" rating is not ranked there.
update public.profiles set rated_games_bullet = 0 where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
set local role service_role;
select is(public.leaderboard_rank('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'all'), null, 'All: no rated pool, no rank');
select is(public.leaderboard_rank('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'all'), 2, 'All: the others move up');
reset role;

-- The rank agrees with the list order the web app asks for.
select results_eq(
  $$ select username from public.profiles where rating_all is not null order by rating_all desc, username asc $$,
  $$ values ('alice'::text), ('bob'), ('carol') $$,
  'the All list order is the rank order'
);

select * from finish();
rollback;
