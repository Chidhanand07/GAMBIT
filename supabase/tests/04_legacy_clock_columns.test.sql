-- SCHEMA-CLEANUP (ADR F-070): the legacy clock columns are gone; the canonical pair stays.
begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

select hasnt_column('public', 'games', 'white_time_ms', 'games has no white_time_ms column');
select hasnt_column('public', 'games', 'black_time_ms', 'games has no black_time_ms column');
select has_column('public', 'games', 'white_clock_ms', 'white_clock_ms (the clock the server writes) is kept');
select has_column('public', 'games', 'black_clock_ms', 'black_clock_ms (the clock the server writes) is kept');

select * from finish();
rollback;
