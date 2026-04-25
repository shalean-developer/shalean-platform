comment on function public.claim_team_capacity_slot(uuid, date, integer) is
  'Atomic team-day slot claim via team_daily_capacity_usage. Pre-sort slot load in apps/web/lib/dispatch/assignTeamToBooking.ts counts is_team_job rows whose status is in CAPACITY_STATUSES (pending, assigned, in_progress) — keep that set aligned with how used_slots moves so allocator and RPC do not drift.';
