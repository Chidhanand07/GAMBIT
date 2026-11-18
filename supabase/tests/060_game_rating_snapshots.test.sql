-- F-120 (SEC-04, NODE-16, TEST-04): a rated game records its rating category and both players'
-- ratings before and after it. Only public.apply_game_result writes them: not the browser roles,
-- not the secret key directly. Unrated games and refused calls leave them null.
begin;
create extension if not exists pgtap with schema extensions;

select plan(24);

-- Fixtures (as the migration role) -------------------------------------------
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice@example.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bob@example.test');

insert into public.profiles
  (id, username, rating_rapid, rating_blitz, rating_rd, rating_vol, games_played, wins, losses, draws)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice', 1200, 1300, 100, 0.06, 10, 4, 5, 1),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bob',   1500, 1500,  80, 0.06, 20, 10, 8, 2);

-- 1 rated rapid, alice (white) beats bob; 2 unrated draw; 3 rated blitz (used for the stale case).
insert into public.games (id, white_id, black_id, time_control, status, result, is_rated) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '10+0', 'completed', 'white', true),
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '3+0',  'completed', 'draw',  false),
  ('33333333-3333-4333-8333-333333333333', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '3+0',  'completed', 'black', true);

-- ================================== schema ===================================
select has_column('public', 'games', 'rating_category', 'games has rating_category');
select col_type_is('public', 'games', 'white_rating_before', 'numeric(7,2)', 'white_rating_before is numeric(7,2)');
select col_type_is('public', 'games', 'white_rating_after', 'numeric(7,2)', 'white_rating_after is numeric(7,2)');
select col_type_is('public', 'games', 'black_rating_before', 'numeric(7,2)', 'black_rating_before is numeric(7,2)');
select col_type_is('public', 'games', 'black_rating_after', 'numeric(7,2)', 'black_rating_after is numeric(7,2)');
select throws_ok(
  $$ update public.games set rating_category = 'daily' where id = '22222222-2222-4222-8222-222222222222' $$,
  '23514', null, 'rating_category only takes the four rating pools'
);

-- ================================ privileges =================================
select is_empty(
  $$ select a.attname from pg_catalog.pg_attribute a
     where a.attrelid = 'public.games'::regclass and a.attnum > 0 and not a.attisdropped
       and (has_column_privilege('anon', 'public.games', a.attname, 'UPDATE')
         or has_column_privilege('authenticated', 'public.games', a.attname, 'UPDATE')
         or has_column_privilege('anon', 'public.games', a.attname, 'INSERT')
         or has_column_privilege('authenticated', 'public.games', a.attname, 'INSERT')) $$,
  'the browser roles cannot INSERT or UPDATE any column of games'
);
select is_empty(
  $$ select c from unnest(array['rated_at', 'rating_category', 'white_rating_before', 'white_rating_after',
                                'black_rating_before', 'black_rating_after']) c
     where has_column_privilege('service_role', 'public.games', c, 'UPDATE')
        or has_column_privilege('service_role', 'public.games', c, 'INSERT') $$,
  'service_role cannot write the rating snapshot columns or rated_at directly'
);
select ok(
  has_column_privilege('service_role', 'public.games', 'status', 'UPDATE')
    and has_column_privilege('service_role', 'public.games', 'final_fen', 'UPDATE')
    and has_column_privilege('service_role', 'public.games', 'white_accuracy', 'UPDATE')
    and has_column_privilege('service_role', 'public.games', 'white_id', 'INSERT')
    and has_table_privilege('service_role', 'public.games', 'SELECT')
    and has_table_privilege('service_role', 'public.games', 'DELETE'),
  'service_role keeps what the finalizer, the web app and the engine write'
);

-- ================================ as the roles ===============================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select throws_ok(
  $$ update public.games set white_rating_after = 3000 where id = '11111111-1111-4111-8111-111111111111' $$,
  '42501', null, 'a player cannot write a rating snapshot of their own game'
);
reset role;

set local role service_role;
select throws_ok(
  $$ update public.games set white_rating_after = 3000 where id = '11111111-1111-4111-8111-111111111111' $$,
  '42501', null, 'the secret key cannot write a rating snapshot directly'
);
select lives_ok(
  $$ update public.games set final_fen = final_fen where id = '11111111-1111-4111-8111-111111111111' $$,
  'the secret key still updates the columns the finalizer writes'
);

-- Stale call for game 3: nothing may be recorded.
select is(
  public.apply_game_result(
    '33333333-3333-4333-8333-333333333333', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'black', 'rating_blitz',
    '{"old_rating":1499,"old_rd":80,"old_vol":0.06,"old_games_played":20,"new_rating":1480,"new_rd":79,"new_vol":0.06}',
    '{"old_rating":1300,"old_rd":100,"old_vol":0.06,"old_games_played":10,"new_rating":1320,"new_rd":99,"new_vol":0.06}'),
  'stale',
  'a stale call is refused'
);

-- Rated game 1 and unrated game 2.
select is(
  public.apply_game_result(
    '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'white', 'rating_rapid',
    '{"old_rating":1200,"old_rd":100,"old_vol":0.06,"old_games_played":10,"new_rating":1232.456,"new_rd":95.5,"new_vol":0.0599}',
    '{"old_rating":1500,"old_rd":80,"old_vol":0.06,"old_games_played":20,"new_rating":1480.004,"new_rd":78.25,"new_vol":0.0601}'),
  'applied',
  'a rated game is applied'
);
select is(
  public.apply_game_result(
    '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'white', 'rating_rapid',
    '{"old_rating":1232.46,"old_rd":95.5,"old_vol":0.0599,"old_games_played":11,"new_rating":1300,"new_rd":90,"new_vol":0.06}',
    '{"old_rating":1480,"old_rd":78.25,"old_vol":0.0601,"old_games_played":21,"new_rating":1400,"new_rd":70,"new_vol":0.06}'),
  'already_applied',
  'a second call is a no-op'
);
select is(
  public.apply_game_result(
    '22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'draw'),
  'applied',
  'an unrated game is applied'
);
reset role;

-- ========================= what ended up on the games ========================
select results_eq(
  $$ select rating_category, white_rating_before, white_rating_after, black_rating_before, black_rating_after
     from public.games where id = '11111111-1111-4111-8111-111111111111' $$,
  $$ values ('rapid'::text, 1200.00::numeric, 1232.46::numeric, 1500.00::numeric, 1480.00::numeric) $$,
  'game 1: pool, both ratings before (stored values) and after (rounded like the profile columns)'
);
select results_eq(
  $$ select white_rating_after, black_rating_after from public.games where id = '11111111-1111-4111-8111-111111111111' $$,
  $$ select (select rating_rapid from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
            (select rating_rapid from public.profiles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') $$,
  'the "after" values are exactly what the profiles now hold'
);
select is(
  (select white_rating_after from public.games where id = '11111111-1111-4111-8111-111111111111'),
  1232.46::numeric(7,2),
  'the second (already_applied) call did not overwrite the snapshot'
);
select results_eq(
  $$ select rating_category, white_rating_before, white_rating_after, black_rating_before, black_rating_after
     from public.games where id = '22222222-2222-4222-8222-222222222222' $$,
  $$ values (null::text, null::numeric, null::numeric, null::numeric, null::numeric) $$,
  'game 2 (unrated): no rating snapshot'
);
select isnt(
  (select rated_at from public.games where id = '22222222-2222-4222-8222-222222222222'), null,
  'game 2 (unrated) is still marked as applied'
);
select results_eq(
  $$ select rating_category, white_rating_before, white_rating_after, rated_at
     from public.games where id = '33333333-3333-4333-8333-333333333333' $$,
  $$ values (null::text, null::numeric, null::numeric, null::timestamptz) $$,
  'game 3 (stale): nothing recorded'
);

-- Existing finished games keep null snapshots (they cannot be recomputed).
select ok(
  (select count(*) from public.games where rating_category is null) = 2,
  'only the game applied after the migration has a snapshot'
);
select ok(
  not has_function_privilege('authenticated', 'public.apply_game_result(uuid, uuid, uuid, text, text, jsonb, jsonb)', 'execute'),
  'the function stays service-role only'
);

select * from finish();
rollback;
