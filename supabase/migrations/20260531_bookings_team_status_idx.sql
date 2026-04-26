-- Speeds admin DELETE / guards that probe team bookings by team_id + status (team jobs only).

create index if not exists idx_bookings_team_status_team_job
  on public.bookings (team_id, status)
  where is_team_job = true;
