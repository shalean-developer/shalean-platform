-- Narrow index for roster / counts: team_id with a cleaner (excludes placeholder rows if any).

create index if not exists idx_team_members_team_id
  on public.team_members (team_id)
  where cleaner_id is not null;
