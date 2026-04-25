-- Run in Supabase SQL Editor (or psql) AFTER migrations are applied:
--   npx supabase db push
--   (or your CI migration deploy to the same project the app uses)
--
-- 1) Must return exactly 1 row (column exists on public.bookings).
-- 2) Optional: claim_team_capacity_slot should have a non-null description after 20260528 migration.

-- ---------------------------------------------------------------------------
-- 1) team_member_count_snapshot column (expect 1 row)
-- ---------------------------------------------------------------------------

select column_name,
       data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'bookings'
  and column_name = 'team_member_count_snapshot';

-- ---------------------------------------------------------------------------
-- 2) Function comment (expect one non-null comment_text after migration)
-- ---------------------------------------------------------------------------

select pg_catalog.obj_description(
         'public.claim_team_capacity_slot(uuid, date, integer)'::regprocedure,
         'pg_proc'
       ) as comment_text;
