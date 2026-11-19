-- DELETE-ACCOUNT (ADR F-145; SEC-03, TEST-04): public.delete_account removes a user's data in
-- one transaction, keeps their finished games for the opponents (anonymised), refuses while they
-- play, and only the service role may call it. A guard pins every foreign key to profiles, so a
-- new table that references profiles must be handled here before it can ship.
-- F-164 (stacking follow-up e): re-run on the whole stack's schema (B1's rating snapshots,
-- end_reason, per-pool counters, rating_all, profile fields, leaderboard view and rank; B2 and B4
-- add no tables); a second guard pins every uuid column, so a user id stored without a foreign
-- key cannot slip past the first one.
begin;
create extension if not exists pgtap with schema extensions;

select plan(28);

-- Fixtures ------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice@example.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bob@example.test'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'carol@example.test');
-- B1's profile data: per-pool rated games (so rating_all is set), public-profile fields.
insert into public.profiles (id, username, rating_blitz, rated_games_blitz, city, playing_style) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice', 1500, 3, 'Pune', 'aggressive'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bob',   1400, 2, null, null),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'carol', 1200, 0, null, null);

-- alice beat bob; bob beat alice; an open invite of alice; carol plays bob right now.
insert into public.games (id, white_id, black_id, winner_id, time_control, status, result) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '10', 'completed', 'white'),
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '3', 'completed', 'white'),
  ('33333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, null, '10', 'waiting', null),
  ('44444444-4444-4444-8444-444444444444', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
   null, '10', 'active', null);
-- The game alice won was rated (F-120 snapshot) and ended by checkmate (F-124).
update public.games
set is_rated = true, rated_at = now(), rating_category = 'blitz', end_reason = 'checkmate',
    white_rating_before = 1490, white_rating_after = 1500, black_rating_before = 1410, black_rating_after = 1400
where id = '11111111-1111-4111-8111-111111111111';
insert into public.game_invites (game_id, token) values ('33333333-3333-4333-8333-333333333333', 'tok-alice');
insert into public.moves (game_id, move_number, color, uci, san, fen_after) values
  ('11111111-1111-4111-8111-111111111111', 1, 'white', 'e2e4', 'e4', 'x');
insert into public.messages (game_id, user_id, content) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'gg'),
  ('11111111-1111-4111-8111-111111111111', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'thanks');
insert into public.friendships (requester_id, addressee_id, status) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'accepted'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'accepted');
insert into public.notifications (user_id, type, payload) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'challenge', '{}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'challenge', '{"from_user_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'game_result', '{"message":"You lost"}');
insert into public.user_preferences (user_id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

-- Before: alice leads the blitz board and bob is second.
set local role service_role;
select is(public.leaderboard_rank('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'blitz'), 2, 'before: bob is second on blitz');
reset role;

-- ================================ privileges =================================
select ok(
  not has_function_privilege('anon', 'public.delete_account(uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.delete_account(uuid)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.delete_account(uuid)', 'EXECUTE'),
  'only service_role may execute delete_account'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select throws_ok(
  $$ select public.delete_account('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') $$,
  '42501', null, 'a signed-in user cannot call it (not even for someone else)'
);
reset role;

-- ============================ refused while playing ==========================
set local role service_role;
select throws_ok(
  $$ select public.delete_account('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') $$,
  '55000', 'active_game', 'a player in an active game cannot be deleted'
);
select is(
  (select count(*) from public.profiles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  1::bigint, 'the refusal changed nothing'
);
select throws_ok(
  $$ select public.delete_account('dddddddd-dddd-4ddd-8ddd-dddddddddddd') $$,
  'P0002', null, 'an unknown user is an error'
);

-- ================================ delete alice ===============================
select is(
  public.delete_account('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  '{"games_anonymised": 2, "games_deleted": 1, "messages_deleted": 1, "friendships_deleted": 1, "notifications_deleted": 2}'::jsonb,
  'reports what it did'
);
reset role;

select is((select count(*) from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0::bigint, 'profile deleted');
select is((select count(*) from public.user_preferences where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0::bigint, 'preferences deleted');
select is(
  (select count(*) from public.friendships where 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' in (requester_id, addressee_id)),
  0::bigint, 'friendships deleted'
);
select is(
  (select count(*) from public.friendships), 1::bigint, 'other people''s friendships are kept'
);
select is(
  (select count(*) from public.notifications where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' or payload ->> 'from_user_id' = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  0::bigint, 'her notifications and the ones that name her are deleted'
);
select is((select count(*) from public.notifications), 1::bigint, 'bob''s other notification is kept');
select is(
  (select count(*) from public.messages where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0::bigint, 'her chat lines deleted'
);
select is((select count(*) from public.messages), 1::bigint, 'bob''s chat line is kept');

-- Finished games stay for bob, with alice's side and her win anonymised.
select results_eq(
  $$ select white_id, black_id, winner_id, result from public.games
     where id = '11111111-1111-4111-8111-111111111111' $$,
  $$ values (null::uuid, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid, null::uuid, 'white'::text) $$,
  'a game she won: kept, her side and win nulled, the result still says white won'
);
select results_eq(
  $$ select white_id, black_id, winner_id from public.games where id = '22222222-2222-4222-8222-222222222222' $$,
  $$ values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid, null::uuid, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid) $$,
  'a game bob won: kept, bob still the winner'
);
select is((select count(*) from public.moves), 1::bigint, 'the moves of kept games are kept');
select is(
  (select count(*) from public.games where id = '33333333-3333-4333-8333-333333333333'), 0::bigint,
  'her open invite (never played) is deleted'
);
select is((select count(*) from public.game_invites), 0::bigint, 'with its invite token');
select is(
  (select status from public.games where id = '44444444-4444-4444-8444-444444444444'), 'active',
  'other people''s live games are untouched'
);
select is(
  (select count(*) from auth.users where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 1::bigint,
  'the auth user is left for the Auth admin API (the caller deletes it next)'
);

-- B1's data around the kept game and the leaderboard.
select results_eq(
  $$ select rating_category, end_reason, white_rating_before, white_rating_after, black_rating_before, black_rating_after
     from public.games where id = '11111111-1111-4111-8111-111111111111' $$,
  $$ values ('blitz'::text, 'checkmate'::text, 1490.00::numeric, 1500.00::numeric, 1410.00::numeric, 1400.00::numeric) $$,
  'the kept game keeps its rating snapshot and how it ended (bob''s history and rating chart)'
);
set local role service_role;
select is(
  (select count(*) from public.leaderboard_profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0::bigint,
  'she is off the leaderboard view'
);
select is(public.leaderboard_rank('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'blitz'), 1, 'bob moves up to first on blitz');
select is(public.leaderboard_rank('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'all'), null, 'she has no rank anywhere');
reset role;

-- ===================== guard: every FK to profiles is handled =====================
-- delete_account nulls games.(white|black|winner)_id and deletes messages; every other
-- reference must cascade. A new table referencing profiles fails here until it is handled.
select is_empty(
  $$ select format('%s.%s', c.conrelid::regclass, a.attname)
     from pg_catalog.pg_constraint c
     join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
     where c.contype = 'f' and c.confrelid = 'public.profiles'::regclass
       and c.confdeltype <> 'c'
       and format('%s.%s', c.conrelid::regclass, a.attname) not in
         ('games.white_id', 'games.black_id', 'games.winner_id', 'messages.user_id') $$,
  'every foreign key to profiles cascades or is handled by delete_account'
);

-- ================ guard: every uuid column is a known id or user reference ================
-- A user id stored without a foreign key (a new "offered_by uuid" column, say) would escape the
-- guard above; this list must be extended, and delete_account taught the column, before it ships.
select is_empty(
  $$ select format('%s.%s', c.table_name, c.column_name)
     from information_schema.columns c
     join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public' and t.table_type = 'BASE TABLE' and c.data_type = 'uuid'
       and format('%s.%s', c.table_name, c.column_name) not in (
         -- primary keys and game references (not users)
         'friendships.id', 'games.id', 'messages.id', 'moves.id', 'notifications.id',
         'game_invites.game_id', 'messages.game_id', 'moves.game_id',
         -- user references, each handled above (FK guard)
         'profiles.id', 'friendships.requester_id', 'friendships.addressee_id',
         'games.white_id', 'games.black_id', 'games.winner_id',
         'messages.user_id', 'notifications.user_id', 'user_preferences.user_id') $$,
  'every uuid column is a key, a game reference or a user reference delete_account handles'
);

select * from finish();
rollback;
