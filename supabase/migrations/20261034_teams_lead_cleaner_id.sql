-- Admin-appointed default team lead (not auto-first member). Used for payout_owner on team job assignment.

alter table public.teams
  add column if not exists lead_cleaner_id uuid references public.cleaners(id) on delete set null;

create index if not exists teams_lead_cleaner_id_idx on public.teams (lead_cleaner_id);

comment on column public.teams.lead_cleaner_id is
  'Admin-appointed team lead. Must be an active team_members.cleaner_id. Drives payout_owner on new team assignments.';
