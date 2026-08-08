-- Prevent duplicate cleaner payout rows for the same booking.
-- Production duplicates were repaired before this forward guard was applied.
create unique index if not exists team_job_member_payouts_booking_cleaner_uidx
  on public.team_job_member_payouts (booking_id, cleaner_id)
  where cleaner_id is not null;
