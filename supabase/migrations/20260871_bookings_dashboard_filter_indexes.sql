-- Support cleaner dashboard / jobs: OR visibility filters + order by date, time.
-- Existing: bookings_cleaner_id_idx (cleaner_id), bookings_payout_owner_cleaner_id_idx (partial),
-- idx_bookings_team_status_team_job (team_id, status), bookings_status_date_idx (status, date),
-- booking_cleaners_booking_id_idx, booking_cleaners_cleaner_id_idx.

create index if not exists idx_bookings_date_time
  on public.bookings (date asc, time asc);

comment on index public.idx_bookings_date_time is
  'Speeds cleaner dashboard list ordering after OR filters (cleaner_id / team / roster / payout owner).';
