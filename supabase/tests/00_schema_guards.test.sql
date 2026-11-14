-- Schema-level guarantees after the high-risk lockdown (SEC-03, TEST-04).
begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

-- Every table the API can reach has row level security on.
select is_empty(
  $$
    select c.relname
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
  $$,
  'every table in schema public has RLS enabled'
);

-- MATCHMAKING-QUEUE: the unused, unprotected table is gone.
select hasnt_table('public', 'matchmaking_queue', 'public.matchmaking_queue was dropped');

-- INV-TOKEN: the token no longer lives on the world-readable games table.
select hasnt_column('public', 'games', 'invite_token', 'games has no invite_token column');
select hasnt_column('public', 'games', 'invite_expires_at', 'games has no invite_expires_at column');
select has_table('public', 'game_invites', 'invites live in public.game_invites');

-- ...and the expand-phase mirror is cleaned up.
select hasnt_function('public', 'sync_game_invite_from_games', 'the expand-phase mirror function was dropped');
select is_empty(
  $$ select tgname from pg_catalog.pg_trigger where tgname = 'games_sync_invite' $$,
  'the expand-phase mirror trigger was dropped'
);

-- game_invites is service-role only: RLS on, and not one policy.
select is_empty(
  $$ select policyname from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'game_invites' $$,
  'game_invites has no policies (nothing is visible through the API roles)'
);

select * from finish();
rollback;
