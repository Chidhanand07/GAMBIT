-- DRAW-OFFER (ADR F-165; TEST-04): an agreed draw is stored as end_reason 'agreement', written by
-- the game server like every other reason; unknown codes are still refused.
begin;
create extension if not exists pgtap with schema extensions;

select plan(3);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice@example.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bob@example.test');
insert into public.profiles (id, username) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bob');
insert into public.games (id, white_id, black_id, time_control, status, result) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '3+0', 'active', null);

set local role service_role;
select lives_ok(
  $$ update public.games set status = 'completed', result = 'draw', end_reason = 'agreement'
     where id = '11111111-1111-4111-8111-111111111111' and status = 'active' $$,
  'the finalizer stores an agreed draw as agreement'
);
reset role;
select is(
  (select end_reason from public.games where id = '11111111-1111-4111-8111-111111111111'), 'agreement',
  'the agreed draw is recorded'
);
select throws_ok(
  $$ update public.games set end_reason = 'mutual' where id = '11111111-1111-4111-8111-111111111111' $$,
  '23514', null, 'other codes are still refused'
);

select * from finish();
rollback;
