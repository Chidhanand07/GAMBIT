-- SETTINGS-PREFS (ADR F-146; TEST-04): premoves / allow_takebacks default off, are writable by
-- the owner, and readable (not writable) by service_role.
begin;
create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users (id, email) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice@example.test');
insert into public.profiles (id, username) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice');

select col_default_is('public', 'user_preferences', 'premoves', 'false', 'premoves is off by default');
select col_default_is('public', 'user_preferences', 'allow_takebacks', 'false', 'takebacks are off by default');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select lives_ok(
  $$ insert into public.user_preferences (user_id, premoves) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true) $$,
  'the owner sets premoves on her row'
);
select lives_ok(
  $$ update public.user_preferences set allow_takebacks = true where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  'the owner sets allow_takebacks'
);
reset role;

set local role service_role;
select is(
  (select premoves and allow_takebacks from public.user_preferences), true, 'service_role reads both'
);
select throws_ok(
  $$ update public.user_preferences set premoves = false $$, '42501', null, 'service_role cannot write them'
);
reset role;

select * from finish();
rollback;
