-- INV-TOKEN (TEST-04): invite tokens are invisible to the API roles, and game
-- rows carry no token columns.
begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

insert into auth.users (id, email) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice@example.test');
insert into public.profiles (id, username) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice');
insert into public.games (id, white_id, time_control, status)
values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '10', 'waiting');
insert into public.game_invites (game_id, token, expires_at)
values ('11111111-1111-4111-8111-111111111111', 'SECRETTOKN', now() + interval '48 hours');

-- ================================== anon =====================================
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok($$ select * from public.game_invites $$, '42501', null, 'anon cannot SELECT game_invites');
select throws_ok(
  $$ select token from public.game_invites where game_id = '11111111-1111-4111-8111-111111111111' $$,
  '42501', null, 'anon cannot read a token even by game id'
);
select throws_ok(
  $$ insert into public.game_invites (game_id, token) values ('11111111-1111-4111-8111-111111111111', 'x') $$,
  '42501', null, 'anon cannot INSERT invites'
);
select throws_ok($$ delete from public.game_invites $$, '42501', null, 'anon cannot DELETE invites');

-- Games stay readable (spectating), but a game row has nothing secret on it.
select is((select count(*) from public.games), 1::bigint, 'anon can still read games');
select is(
  (select to_jsonb(g) ? 'invite_token' from public.games g limit 1),
  false,
  'a games row contains no invite_token'
);
select is(
  (select to_jsonb(g) ? 'invite_expires_at' from public.games g limit 1),
  false,
  'a games row contains no invite_expires_at'
);
select is(
  (select to_jsonb(g)::text like '%SECRETTOKN%' from public.games g limit 1),
  false,
  'the token appears nowhere in a games row'
);

-- ============================ authenticated: the creator ======================
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);

select throws_ok(
  $$ select * from public.game_invites $$,
  '42501', null, 'authenticated cannot SELECT game_invites (not even the creator: the API returns the token once, on creation)'
);
select throws_ok(
  $$ update public.game_invites set token = 'guessme' $$,
  '42501', null, 'authenticated cannot UPDATE invites'
);

-- =============================== service role =================================
reset role;
set local role service_role;
select is(
  (select token from public.game_invites where game_id = '11111111-1111-4111-8111-111111111111'),
  'SECRETTOKN',
  'service_role reads the invite (the game server and the Next.js routes use it)'
);
select throws_ok(
  $$ insert into public.game_invites (game_id, token) values ('11111111-1111-4111-8111-111111111111', 'OTHERTOKEN') $$,
  '23505', null, 'one invite per game'
);
reset role;

-- Deleting the game removes its invite.
delete from public.games where id = '11111111-1111-4111-8111-111111111111';
select is((select count(*) from public.game_invites), 0::bigint, 'the invite is deleted with its game (ON DELETE CASCADE)');

select * from finish();
rollback;
