-- RATING-ATOMIC (SEC-04, SEC-06, NODE-18, TEST-04): public.apply_game_result
-- is a locked-down security definer function that applies a completed game to
-- both profiles exactly once, refuses games that are not completed or do not
-- match, and refuses (as 'stale') ratings computed from outdated values.
begin;
create extension if not exists pgtap with schema extensions;

select plan(31);

-- Fixtures (as the migration role) -------------------------------------------
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice@example.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bob@example.test'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'carol@example.test');

insert into public.profiles
  (id, username, rating_rapid, rating_blitz, rating_rd, rating_vol, games_played, wins, losses, draws)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice', 1200, 1300, 100, 0.06, 10, 4, 5, 1),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bob',   1500, 1500,  80, 0.06, 20, 10, 8, 2),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'carol', 1400, 1400, 100, 0.06,  5, 2, 2, 1);

-- 1 rated, alice (white) beats bob; 2 unrated draw; 3 aborted; 4 active;
-- 5 rated, bob (white) beats alice (used for the stale case).
insert into public.games (id, white_id, black_id, time_control, status, result, is_rated) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '10', 'completed', 'white', true),
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '3',  'completed', 'draw',  false),
  ('33333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '10', 'aborted',   null,    true),
  ('44444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '10', 'active',    null,    true),
  ('55555555-5555-4555-8555-555555555555', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '10', 'completed', 'white', true);

-- ================================ the function ===============================
select has_column('public', 'games', 'rated_at', 'games has a rated_at column');
select col_type_is('public', 'games', 'rated_at', 'timestamp with time zone', 'games.rated_at is timestamptz');
select has_function(
  'public', 'apply_game_result', array['uuid', 'uuid', 'uuid', 'text', 'text', 'jsonb', 'jsonb'],
  'public.apply_game_result exists'
);
select is_definer(
  'public', 'apply_game_result', array['uuid', 'uuid', 'uuid', 'text', 'text', 'jsonb', 'jsonb'],
  'apply_game_result is security definer'
);
select is(
  (select p.proconfig from pg_catalog.pg_proc p
   where p.oid = 'public.apply_game_result(uuid, uuid, uuid, text, text, jsonb, jsonb)'::regprocedure),
  array['search_path=""'],
  'apply_game_result pins search_path to the empty string'
);
select ok(
  not has_function_privilege('anon', 'public.apply_game_result(uuid, uuid, uuid, text, text, jsonb, jsonb)', 'execute'),
  'anon has no EXECUTE'
);
select ok(
  not has_function_privilege('authenticated', 'public.apply_game_result(uuid, uuid, uuid, text, text, jsonb, jsonb)', 'execute'),
  'authenticated has no EXECUTE'
);
select ok(
  has_function_privilege('service_role', 'public.apply_game_result(uuid, uuid, uuid, text, text, jsonb, jsonb)', 'execute'),
  'service_role has EXECUTE'
);

-- ============================ anon / authenticated ===========================
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$ select public.apply_game_result('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
       'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'white') $$,
  '42501', null, 'anon cannot call apply_game_result'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select throws_ok(
  $$ select public.apply_game_result('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
       'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'white') $$,
  '42501', null, 'a signed-in player cannot call apply_game_result, even for their own game'
);
reset role;

-- ================================ service_role ===============================
set local role service_role;

-- Refusals: aborted, active, wrong players, wrong result, rating an unrated game, bad field.
select throws_ok(
  $$ select public.apply_game_result('33333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
       'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'white') $$,
  '55000', null, 'an aborted game is never applied'
);
select throws_ok(
  $$ select public.apply_game_result('44444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
       'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'white') $$,
  '55000', null, 'an active game is refused'
);
select throws_ok(
  $$ select public.apply_game_result('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
       'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'white') $$,
  '22023', null, 'players that do not match the game are refused'
);
select throws_ok(
  $$ select public.apply_game_result('11111111-1111-4111-8111-111111111111', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'black') $$,
  '22023', null, 'swapped colours are refused'
);
select throws_ok(
  $$ select public.apply_game_result('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
       'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'black') $$,
  '22023', null, 'a result that does not match the game is refused'
);
select throws_ok(
  $$ select public.apply_game_result('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'draw', 'rating_blitz',
       '{"old_rating":1500,"old_rd":80,"old_vol":0.06,"old_games_played":20,"new_rating":1500,"new_rd":80,"new_vol":0.06}',
       '{"old_rating":1300,"old_rd":100,"old_vol":0.06,"old_games_played":10,"new_rating":1300,"new_rd":100,"new_vol":0.06}') $$,
  '22023', null, 'an unrated game cannot be rated'
);
select throws_ok(
  $$ select public.apply_game_result('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
       'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'white', 'wins',
       '{"new_rating":9999,"new_rd":1,"new_vol":1}', '{"new_rating":9999,"new_rd":1,"new_vol":1}') $$,
  '22023', null, 'only the four rating columns can be written'
);
select throws_ok(
  $$ select public.apply_game_result('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
       'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'white', 'rating_rapid', '{}', '{}') $$,
  '22023', null, 'a rated call without new values is refused'
);

-- Rated game 1: applied once.
select is(
  public.apply_game_result(
    '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'white', 'rating_rapid',
    '{"old_rating":1200,"old_rd":100,"old_vol":0.06,"old_games_played":10,"new_rating":1232,"new_rd":95.5,"new_vol":0.0599}',
    '{"old_rating":1500,"old_rd":80,"old_vol":0.06,"old_games_played":20,"new_rating":1480,"new_rd":78.25,"new_vol":0.0601}'),
  'applied',
  'service_role applies a rated game'
);
select is(
  public.apply_game_result(
    '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'white', 'rating_rapid',
    '{"old_rating":1232,"old_rd":95.5,"old_vol":0.0599,"old_games_played":11,"new_rating":1300,"new_rd":90,"new_vol":0.06}',
    '{"old_rating":1480,"old_rd":78.25,"old_vol":0.0601,"old_games_played":21,"new_rating":1400,"new_rd":70,"new_vol":0.06}'),
  'already_applied',
  'a second call for the same game is a no-op, even with matching inputs'
);

-- Stale: game 5 computed from the values before game 1 was applied.
select is(
  public.apply_game_result(
    '55555555-5555-4555-8555-555555555555', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'white', 'rating_rapid',
    '{"old_rating":1500,"old_rd":80,"old_vol":0.06,"old_games_played":20,"new_rating":1510,"new_rd":79,"new_vol":0.06}',
    '{"old_rating":1200,"old_rd":100,"old_vol":0.06,"old_games_played":10,"new_rating":1190,"new_rd":99,"new_vol":0.06}'),
  'stale',
  'ratings computed from outdated profile values are refused as stale'
);

-- Unrated game 2 (bob white, alice black, draw): statistics only.
select is(
  public.apply_game_result(
    '22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'draw'),
  'applied',
  'service_role applies an unrated game'
);
select is(
  public.apply_game_result(
    '22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'draw'),
  'already_applied',
  'an unrated game is also applied only once'
);
reset role;

-- ===================== what actually ended up in the tables ===================
select results_eq(
  $$ select rating_rapid::numeric, rating_blitz::numeric, rating_rd, rating_vol, games_played, wins, losses, draws
     from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  $$ values (1232::numeric, 1300::numeric, 95.5::double precision, 0.0599::double precision, 12, 5, 5, 2) $$,
  'alice: game 1 rated (rapid, rd, vol) + game 1 and game 2 counted (win, draw); blitz untouched'
);
select results_eq(
  $$ select rating_rapid::numeric, rating_blitz::numeric, rating_rd, rating_vol, games_played, wins, losses, draws
     from public.profiles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' $$,
  $$ values (1480::numeric, 1500::numeric, 78.25::double precision, 0.0601::double precision, 22, 10, 9, 3) $$,
  'bob: game 1 rated (loss) + game 2 counted (draw); the unrated game did not touch the rating'
);
select results_eq(
  $$ select rating_rapid::numeric, games_played, wins, losses, draws
     from public.profiles where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' $$,
  $$ values (1400::numeric, 5, 2, 2, 1) $$,
  'carol (named in a refused call) is unchanged'
);
select isnt(
  (select rated_at from public.games where id = '11111111-1111-4111-8111-111111111111'), null,
  'game 1 has rated_at'
);
select isnt(
  (select rated_at from public.games where id = '22222222-2222-4222-8222-222222222222'), null,
  'game 2 (unrated) has rated_at'
);
select is(
  (select rated_at from public.games where id = '55555555-5555-4555-8555-555555555555'), null,
  'the stale game 5 is not marked'
);
select is(
  (select count(*) from public.games where rated_at is not null
     and id in ('33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444')),
  0::bigint,
  'the aborted and the active game are not marked'
);
select is(
  (select status from public.games where id = '33333333-3333-4333-8333-333333333333'),
  'aborted',
  'the refused call did not change the aborted game'
);

select * from finish();
rollback;
