-- S11 (SEC-03, SEC-04, TEST-04): a user cannot change their own rating or
-- statistics, can change their display fields, and cannot touch or create
-- anyone else's profile. Checked as `authenticated` and as `anon`, with
-- negative cases and "row unchanged" assertions.
begin;
create extension if not exists pgtap with schema extensions;

select plan(31);

-- Fixtures (as the migration role; RLS does not apply to it) -------------------
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice@example.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bob@example.test'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'carol@example.test');

insert into public.profiles (id, username, display_name, rating_rapid, rating_blitz, games_played, wins, losses, draws)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice', 'Alice', 1200, 1200, 10, 4, 5, 1),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bob', 'Bob', 1500, 1500, 20, 10, 8, 2);

-- ============================ authenticated: alice ===========================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);

select is(
  (select count(*) from public.profiles),
  2::bigint,
  'authenticated can still read profiles'
);

-- The attack: raise my own rating / statistics.
select throws_ok(
  $$ update public.profiles set rating_rapid = 3000 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '42501', null, 'a user cannot UPDATE their own rating_rapid'
);
select throws_ok(
  $$ update public.profiles set rating_blitz = 3000, rating_bullet = 3000, rating_classical = 3000 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '42501', null, 'a user cannot UPDATE their other rating columns'
);
select throws_ok(
  $$ update public.profiles set wins = 999 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '42501', null, 'a user cannot UPDATE their own wins'
);
select throws_ok(
  $$ update public.profiles set games_played = 0, losses = 0, draws = 0 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '42501', null, 'a user cannot UPDATE games_played / losses / draws'
);
select throws_ok(
  $$ update public.profiles set display_name = 'x', rating_rapid = 3000 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '42501', null, 'mixing an allowed column with a rating column is refused as a whole'
);
select throws_ok(
  $$ update public.profiles set username = 'bob2' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '42501', null, 'a user cannot UPDATE their username directly'
);
select throws_ok(
  $$ update public.profiles set id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '42501', null, 'a user cannot UPDATE their id'
);

-- Allowed: my own display fields.
select lives_ok(
  $$ update public.profiles
     set display_name = 'Alice A.', bio = 'hello', country = 'IN', avatar_url = 'https://example.test/a.png'
     where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  'a user can UPDATE their own display_name, bio, country, avatar_url'
);

-- Someone else's row: RLS filters it out, so the UPDATE "succeeds" on 0 rows.
select lives_ok(
  $$ update public.profiles set display_name = 'hacked' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' $$,
  'updating another user''s display_name raises nothing...'
);
select is_empty(
  $$ update public.profiles set bio = 'hacked' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' returning id $$,
  '...and affects 0 rows'
);

-- Inserts: for someone else, and even for myself (all inserts go through the server).
select throws_ok(
  $$ insert into public.profiles (id, username) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'carol') $$,
  '42501', null, 'a user cannot INSERT a profile for another id'
);
select throws_ok(
  $$ insert into public.profiles (id, username, rating_rapid) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice2', 3000) $$,
  '42501', null, 'a user cannot INSERT a profile with a chosen rating'
);
select throws_ok(
  $$ delete from public.profiles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' $$,
  '42501', null, 'a user cannot DELETE profiles'
);

-- ================================== anon =====================================
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is((select count(*) from public.profiles), 2::bigint, 'anon can still read profiles');
select throws_ok(
  $$ update public.profiles set rating_rapid = 3000 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '42501', null, 'anon cannot UPDATE ratings'
);
select throws_ok(
  $$ update public.profiles set display_name = 'x' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '42501', null, 'anon cannot UPDATE display fields either'
);
select throws_ok(
  $$ insert into public.profiles (id, username) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'carol') $$,
  '42501', null, 'anon cannot INSERT a profile (the old policy was WITH CHECK (true))'
);
select throws_ok(
  $$ delete from public.profiles $$,
  '42501', null, 'anon cannot DELETE profiles'
);

-- ===================== what actually ended up in the table ====================
reset role;

select results_eq(
  $$ select rating_rapid::int, rating_blitz::int, games_played, wins, losses, draws
     from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  $$ values (1200, 1200, 10, 4, 5, 1) $$,
  'alice''s rating and statistics are unchanged'
);
select results_eq(
  $$ select display_name, bio, country, avatar_url from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  $$ values ('Alice A.'::text, 'hello'::text, 'IN'::text, 'https://example.test/a.png'::text) $$,
  'alice''s display fields were updated'
);
select results_eq(
  $$ select username, display_name, bio, rating_rapid::int from public.profiles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' $$,
  $$ values ('bob'::text, 'Bob'::text, null::text, 1500) $$,
  'bob''s row is untouched'
);
select is(
  (select count(*) from public.profiles where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
  0::bigint,
  'no profile was created for carol'
);

-- The server path still works: the service role writes ratings and inserts profiles.
set local role service_role;
select lives_ok(
  $$ update public.profiles set rating_rapid = 1216, wins = 5, games_played = 11 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  'service_role can UPDATE ratings and statistics'
);
select lives_ok(
  $$ insert into public.profiles (id, username) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'carol') $$,
  'service_role can INSERT a profile'
);
reset role;
select is(
  (select rating_rapid::int from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  1216,
  'the service-role rating write landed'
);

-- ============================ the policies themselves ==========================
-- (INSERT is blocked by privileges above, so the policy text is asserted directly:
--  it is what protects the table if a grant is ever added back.)
-- (Matched with a pattern, not the exact deparsed text, which differs between Postgres versions.)
select results_eq(
  $$ select cmd::text, roles::text[],
            with_check ~* 'select\s+auth\.uid\(\)' and with_check ~ '=\s*id\)' as owner_check
     from pg_catalog.pg_policies
     where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_insert' $$,
  $$ values ('INSERT'::text, array['authenticated']::text[], true) $$,
  'profiles_insert: TO authenticated WITH CHECK ((select auth.uid()) = id), not WITH CHECK (true)'
);
select results_eq(
  $$ select cmd::text, roles::text[],
            qual ~* 'select\s+auth\.uid\(\)' and qual ~ '=\s*id\)' as owner_using,
            with_check ~* 'select\s+auth\.uid\(\)' and with_check ~ '=\s*id\)' as owner_check
     from pg_catalog.pg_policies
     where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_update' $$,
  $$ values ('UPDATE'::text, array['authenticated']::text[], true, true) $$,
  'profiles_update: TO authenticated, ownership on both USING and WITH CHECK'
);
select is_empty(
  $$ select policyname from pg_catalog.pg_policies
     where schemaname = 'public' and tablename = 'profiles' and with_check = 'true' $$,
  'no profiles policy is WITH CHECK (true)'
);

-- Column privileges, stated as data: exactly four columns are updatable by a user.
-- (has_*_privilege asks the server directly; it does not depend on which grants the
--  current role is allowed to see in information_schema.)
select results_eq(
  $$ select a.attname::text
     from pg_catalog.pg_attribute a
     where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped
       and has_column_privilege('authenticated', 'public.profiles', a.attname, 'UPDATE')
     order by 1 $$,
  $$ values ('avatar_url'::text), ('bio'::text), ('country'::text), ('display_name'::text) $$,
  'authenticated may UPDATE exactly: avatar_url, bio, country, display_name'
);
select is_empty(
  $$ select r.rolname::text || ':' || p.priv
     from (values ('anon'), ('authenticated')) as r(rolname)
     cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) as p(priv)
     where has_table_privilege(r.rolname, 'public.profiles', p.priv) $$,
  'anon / authenticated hold no table-wide INSERT, UPDATE, DELETE or TRUNCATE on profiles'
);

select * from finish();
rollback;
