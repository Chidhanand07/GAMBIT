-- F-124 (NODE-16, TEST-04): games.end_reason holds one of the server's verdict codes, only the
-- server writes it, and old games were backfilled only where the reason is certain.
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice@example.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bob@example.test');
insert into public.profiles (id, username) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bob');
insert into public.games (id, white_id, black_id, time_control, status, result) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '3+0', 'active', null);

select has_column('public', 'games', 'end_reason', 'games has end_reason');
select col_is_null('public', 'games', 'end_reason', 'end_reason is nullable (old games)');
select throws_ok(
  $$ update public.games set end_reason = 'gave up' where id = '11111111-1111-4111-8111-111111111111' $$,
  '23514', null, 'only the known verdict codes are accepted'
);

select ok(
  has_column_privilege('service_role', 'public.games', 'end_reason', 'UPDATE')
    and has_column_privilege('service_role', 'public.games', 'end_reason', 'INSERT'),
  'service_role (the finalizer) can write end_reason'
);
select ok(
  not has_column_privilege('authenticated', 'public.games', 'end_reason', 'UPDATE')
    and not has_column_privilege('anon', 'public.games', 'end_reason', 'UPDATE'),
  'the browser roles cannot'
);

set local role service_role;
select lives_ok(
  $$ update public.games set status = 'completed', result = 'white', end_reason = 'checkmate'
     where id = '11111111-1111-4111-8111-111111111111' and status = 'active' $$,
  'the finalizer writes the reason with the result in one guarded update'
);
reset role;
select is(
  (select end_reason from public.games where id = '11111111-1111-4111-8111-111111111111'),
  'checkmate',
  'the reason is stored'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select throws_ok(
  $$ update public.games set end_reason = 'resignation' where id = '11111111-1111-4111-8111-111111111111' $$,
  '42501', null, 'a player cannot rewrite how their game ended'
);
reset role;
select is(
  (select end_reason from public.games where id = '11111111-1111-4111-8111-111111111111'),
  'checkmate',
  'the stored reason is unchanged'
);

select * from finish();
rollback;
