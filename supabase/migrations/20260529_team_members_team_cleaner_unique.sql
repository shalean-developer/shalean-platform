-- One roster row per (team, cleaner); enables ON CONFLICT DO NOTHING for idempotent adds.
delete from public.team_members a
where a.cleaner_id is not null
  and exists (
    select 1
    from public.team_members b
    where b.team_id = a.team_id
      and b.cleaner_id = a.cleaner_id
      and b.cleaner_id is not null
      and b.id < a.id
  );

create unique index if not exists team_members_team_id_cleaner_id_uidx
  on public.team_members (team_id, cleaner_id)
  where cleaner_id is not null;
