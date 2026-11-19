-- F-123 (SEC-03, TEST-04): the openings read is indexed, and only the server writes moves.
begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice@example.test'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bob@example.test');
insert into public.profiles (id, username) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bob');
insert into public.games (id, white_id, black_id, time_control, status, result, is_rated) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '3+0', 'completed', 'white', true);
insert into public.moves (game_id, move_number, color, uci, san, fen_after) values
  ('11111111-1111-4111-8111-111111111111', 1, 'white', 'e2e4', 'e4', 'fen1'),
  ('11111111-1111-4111-8111-111111111111', 2, 'black', 'e7e5', 'e5', 'fen2');

select has_index('public', 'moves', 'idx_moves_game_ply', 'moves has the (game_id, move_number) index');
select is(
  (select pg_get_indexdef('public.idx_moves_game_ply'::regclass)),
  'CREATE INDEX idx_moves_game_ply ON public.moves USING btree (game_id, move_number)',
  'the index covers game_id then move_number'
);

select ok(
  not has_table_privilege('authenticated', 'public.moves', 'INSERT')
    and not has_table_privilege('authenticated', 'public.moves', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.moves', 'DELETE')
    and not has_table_privilege('anon', 'public.moves', 'INSERT')
    and not has_table_privilege('anon', 'public.moves', 'UPDATE')
    and not has_table_privilege('anon', 'public.moves', 'DELETE'),
  'the browser roles cannot write moves'
);
select ok(
  has_table_privilege('service_role', 'public.moves', 'INSERT')
    and has_table_privilege('authenticated', 'public.moves', 'SELECT')
    and has_table_privilege('anon', 'public.moves', 'SELECT'),
  'the game server still inserts moves; everyone still reads them'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}', true);
select throws_ok(
  $$ insert into public.moves (game_id, move_number, color, uci, san, fen_after)
     values ('11111111-1111-4111-8111-111111111111', 3, 'white', 'f2f4', 'f4', 'x') $$,
  '42501', null, 'a player cannot add a move to their own game'
);
select throws_ok(
  $$ update public.moves set san = 'd4' where game_id = '11111111-1111-4111-8111-111111111111' $$,
  '42501', null, 'a player cannot rewrite a stored move'
);
select is(
  (select string_agg(san, ' ' order by move_number) from public.moves
   where game_id = '11111111-1111-4111-8111-111111111111' and move_number <= 11),
  'e4 e5',
  'the book moves still read back in order'
);
reset role;

select * from finish();
rollback;
