-- Align column name with application: single field `jobs_completed`.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cleaners'
      and column_name = 'total_jobs'
  )
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cleaners'
      and column_name = 'jobs_completed'
  ) then
    alter table public.cleaners rename column total_jobs to jobs_completed;
  end if;
end $$;

comment on column public.cleaners.jobs_completed is 'Count of completed jobs for this cleaner.';
