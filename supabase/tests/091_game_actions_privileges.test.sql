-- STACK-g (ADR F-167; SEC-03, TEST-04): after B1's grant changes (F-120 column grants on games,
-- F-123 browser writes on moves revoked) the game server's role still has every privilege the
-- game actions use: the takeback rollback deletes the undone `moves` rows
-- (movesRepository.deleteAfter) and stores the restored fen and clocks; draw offers, takebacks and
-- premoves end games through the finalizer's row. The browser roles still have none of them.
begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice@example.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bob@example.test');
insert into public.profiles (id, username) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bob');
insert into public.games (id, white_id, black_id, time_control, status, result) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '3+0', 'active', null);
insert into public.moves (game_id, move_number, color, uci, san, fen_after) values
  ('11111111-1111-4111-8111-111111111111', 1, 'white', 'e2e4', 'e4', 'a'),
  ('11111111-1111-4111-8111-111111111111', 2, 'black', 'e7e5', 'e5', 'b'),
  ('11111111-1111-4111-8111-111111111111', 3, 'white', 'g1f3', 'Nf3', 'c');

-- ================================ privileges =================================
select ok(
  has_table_privilege('service_role', 'public.moves', 'DELETE')
    and has_table_privilege('service_role', 'public.moves', 'INSERT'),
  'service_role may insert and delete moves (move log, takeback rollback)'
);
select is_empty(
  $$ select c from unnest(array['fen', 'white_clock_ms', 'black_clock_ms', 'status', 'result', 'winner_id',
       'ended_at', 'final_fen', 'end_reason']) as c
     where not has_column_privilege('service_role', 'public.games', c, 'UPDATE') $$,
  'service_role may update every games column the game actions write'
);
select ok(
  not has_table_privilege('authenticated', 'public.moves', 'DELETE')
    and not has_table_privilege('anon', 'public.moves', 'DELETE'),
  'the browser roles cannot delete moves'
);

-- ============================ the takeback rollback ============================
set local role service_role;
select lives_ok(
  $$ delete from public.moves where game_id = '11111111-1111-4111-8111-111111111111' and move_number > 1 $$,
  'deleteAfter(game, 1): the undone plies are deleted'
);
select lives_ok(
  $$ update public.games set fen = 'a', white_clock_ms = 170000, black_clock_ms = 175000
     where id = '11111111-1111-4111-8111-111111111111' $$,
  'the restored position and clocks are stored'
);
select lives_ok(
  $$ update public.games set status = 'completed', result = 'draw', winner_id = null, ended_at = now(),
       final_fen = 'a', end_reason = 'agreement'
     where id = '11111111-1111-4111-8111-111111111111' and status = 'active' $$,
  'an agreed draw is written through the finalizer row'
);
reset role;
select is(
  (select array_agg(move_number order by move_number) from public.moves
   where game_id = '11111111-1111-4111-8111-111111111111'),
  array[1], 'only the kept ply remains'
);

select * from finish();
rollback;
