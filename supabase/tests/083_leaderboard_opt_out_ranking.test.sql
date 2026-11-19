-- STACK-d (ADR F-163; SEC-04, TEST-04): the leaderboard view carries every column the leaderboard
-- reads, and leaderboard_rank counts only the players on it: a player who turned "Show on
-- leaderboard" off is neither counted ahead of anyone nor given a rank.
begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

-- Fixtures (as the migration role) -------------------------------------------
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice@example.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bob@example.test'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'carol@example.test');

-- blitz: bob 1600 (opted out), alice 1500, carol 1400; all three have rated blitz games.
insert into public.profiles
  (id, username, rating_bullet, rating_blitz, rating_rapid, rating_classical,
   rated_games_bullet, rated_games_blitz, rated_games_rapid, rated_games_classical)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice', 1200, 1500, 1200, 1200, 0, 4, 0, 0),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bob',   1200, 1600, 1200, 1200, 0, 7, 0, 0),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'carol', 1200, 1400, 1200, 1200, 0, 2, 0, 0);
insert into public.user_preferences (user_id, show_on_leaderboard)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false),
       ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', true);

-- ================================ the view ===================================
select has_column('public', 'leaderboard_profiles', 'rating_all', 'the view exposes rating_all');
select ok(
  (select count(*) = 4 from information_schema.columns
   where table_schema = 'public' and table_name = 'leaderboard_profiles'
     and column_name in ('rated_games_bullet', 'rated_games_blitz', 'rated_games_rapid', 'rated_games_classical')),
  'the view exposes the rated-game counter of every pool'
);
-- Every column the web app selects for the list (lib/server/leaderboard.ts LEADERBOARD_COLUMNS).
select is_empty(
  $$ select c from unnest(array['username', 'display_name', 'rating_all', 'rating_bullet', 'rating_blitz',
       'rating_rapid', 'rating_classical', 'rated_games_bullet', 'rated_games_blitz', 'rated_games_rapid',
       'rated_games_classical', 'games_played', 'wins', 'losses', 'draws', 'id']) as c
     where c not in (select column_name from information_schema.columns
                     where table_schema = 'public' and table_name = 'leaderboard_profiles') $$,
  'every column the leaderboard reads is in the view'
);
select ok(
  not has_table_privilege('anon', 'public.leaderboard_profiles', 'SELECT')
    and not has_table_privilege('authenticated', 'public.leaderboard_profiles', 'SELECT')
    and has_table_privilege('service_role', 'public.leaderboard_profiles', 'SELECT'),
  'still only service_role reads the view'
);

set local role service_role;
select results_eq(
  $$ select username, rating_all, rated_games_blitz from public.leaderboard_profiles order by username $$,
  $$ values ('alice'::text, 1500.00::numeric, 4), ('carol', 1400.00, 2) $$,
  'bob opted out: the view lists alice and carol, with All and the per-pool counters'
);

-- ================================= ranks ======================================
select is(public.leaderboard_rank('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'blitz'), 1,
  'blitz: alice is first; the hidden bob is not counted ahead of her');
select is(public.leaderboard_rank('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'blitz'), 2, 'blitz: carol is second');
select is(public.leaderboard_rank('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'all'), 1, 'All: alice is first');
select is(public.leaderboard_rank('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'blitz'), null,
  'an opted-out player gets no rank on a pool board');
select is(public.leaderboard_rank('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'all'), null,
  'an opted-out player gets no rank on All');
reset role;

-- Opting back in puts bob back, first, and everyone else moves down.
update public.user_preferences set show_on_leaderboard = true where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
set local role service_role;
select is(public.leaderboard_rank('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'blitz'), 1, 'opted back in: bob is first');
select is(public.leaderboard_rank('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'blitz'), 2, 'and alice second');
reset role;

-- The rank still agrees with the list order the web app asks for (rating desc, username asc).
set local role service_role;
select is_empty(
  $$ with listed as (
       select id, row_number() over (order by rating_blitz desc, username asc) as place
       from public.leaderboard_profiles where rating_blitz is not null)
     select id from listed where public.leaderboard_rank(id, 'blitz') <> place $$,
  'every listed player''s rank is their place in the list'
);
reset role;

select * from finish();
rollback;
