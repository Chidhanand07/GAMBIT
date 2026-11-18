-- F-127 (SEC-03, SEC-04, TEST-04): a user can set the new public-profile fields on their own row
-- only, the database refuses values outside the limits, and nothing else became writable.
begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice@example.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bob@example.test');
insert into public.profiles (id, username, display_name) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice', 'Alice'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bob', 'Bob');

-- ================================ privileges =================================
select is_empty(
  $$ select c from unnest(array['city', 'website', 'favorite_opening', 'favorite_player', 'pronouns',
                                'playing_style', 'experience']) c
     where not has_column_privilege('authenticated', 'public.profiles', c, 'UPDATE') $$,
  'authenticated can UPDATE each new field'
);
select is_empty(
  $$ select c from unnest(array['city', 'website', 'favorite_opening', 'favorite_player', 'pronouns',
                                'playing_style', 'experience']) c
     where has_column_privilege('anon', 'public.profiles', c, 'UPDATE')
        or has_column_privilege('service_role', 'public.profiles', c, 'UPDATE') $$,
  'anon and service_role cannot'
);
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'rating_rapid', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.profiles', 'username', 'UPDATE')
    and not has_column_privilege('authenticated', 'public.profiles', 'rated_games_rapid', 'UPDATE'),
  'ratings, counters and the username stay out of reach'
);

-- ============================ authenticated: alice ===========================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);

select lives_ok(
  $$ update public.profiles
     set city = 'Bengaluru', website = 'https://lichess.org/@/alice', favorite_opening = 'King''s Gambit',
         favorite_player = 'Magnus Carlsen', pronouns = 'she/her', playing_style = 'aggressive', experience = 'improving'
     where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  'alice sets every new field on her own row'
);
select is(
  (select row(city, website, favorite_opening, favorite_player, pronouns, playing_style, experience)::text
   from public.profiles where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  '(Bengaluru,https://lichess.org/@/alice,"King''s Gambit","Magnus Carlsen",she/her,aggressive,improving)',
  'the values are stored'
);
select lives_ok(
  $$ update public.profiles set city = null, website = null where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  'NULL clears a field'
);
select is_empty(
  $$ update public.profiles set city = 'Hacked' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' returning id $$,
  'she cannot touch bob''s row (no row matches the policy)'
);

-- CHECK constraints: what the API refuses, the database refuses too.
select throws_ok(
  $$ update public.profiles set website = 'http://example.com' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '23514', null, 'website must be https'
);
select throws_ok(
  $$ update public.profiles set website = 'javascript:alert(1)' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '23514', null, 'a script URL is refused'
);
select throws_ok(
  $$ update public.profiles set website = 'https://exa mple.com' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '23514', null, 'a URL with whitespace is refused'
);
select throws_ok(
  $$ update public.profiles set website = 'https://' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '23514', null, 'a URL without a host is refused'
);
select throws_ok(
  $$ update public.profiles set website = 'https://example.com/' || repeat('a', 200) where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '23514', null, 'website is at most 200 characters'
);
select throws_ok(
  $$ update public.profiles set city = repeat('x', 61) where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '23514', null, 'city is at most 60 characters'
);
select throws_ok(
  $$ update public.profiles set city = '' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '23514', null, 'an empty city is stored as NULL, never as ""'
);
select throws_ok(
  $$ update public.profiles set favorite_opening = repeat('x', 81) where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '23514', null, 'favorite_opening is at most 80 characters'
);
select throws_ok(
  $$ update public.profiles set favorite_player = repeat('x', 61) where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '23514', null, 'favorite_player is at most 60 characters'
);
select throws_ok(
  $$ update public.profiles set pronouns = 'xe/xem; drop' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '23514', null, 'pronouns come from the list'
);
select throws_ok(
  $$ update public.profiles set playing_style = 'Aggressive attacker' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '23514', null, 'playing_style comes from the list'
);
select throws_ok(
  $$ update public.profiles set experience = 'grandmaster' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '23514', null, 'experience comes from the list'
);
select throws_ok(
  $$ update public.profiles set rating_rapid = 3000 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '42501', null, 'the rating is still out of reach'
);
reset role;

-- ==================================== anon ===================================
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$ update public.profiles set city = 'x' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  '42501', null, 'anon cannot write any field'
);
reset role;

select is(
  (select city from public.profiles where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  null,
  'bob''s row is unchanged'
);

select * from finish();
rollback;
