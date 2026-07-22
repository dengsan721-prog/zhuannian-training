begin;
select plan(3);
select has_table('public', 'points_ledger', 'points ledger exists');
select col_is_unique('public', 'points_ledger', array['user_id','idempotency_key'], 'point requests are idempotent per user');
select col_is_unique('public', 'points_ledger', array['user_id','reason','source_id'], 'one award per reason and source');
select * from finish();
rollback;
