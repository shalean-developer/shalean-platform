-- P3-13 review E2E cleanup
--
-- Customer SMS is intentionally disabled by application communication policy.
-- Retire the database completion trigger that would otherwise keep creating
-- unsendable review SMS queue rows, and clear only rows that have never sent.
--
-- No customer message is sent by this migration.
-- The queue table/function are preserved for a future explicitly governed
-- customer-SMS re-enable project.

begin;

alter table public.review_sms_prompt_queue
  add column if not exists first_attempts integer not null default 0,
  add column if not exists reminder_attempts integer not null default 0,
  add column if not exists last_error text;

drop trigger if exists bookings_enqueue_review_prompt_on_completion on public.bookings;

delete from public.review_sms_prompt_queue
where first_sent_at is null
  and reminder_sent_at is null;

comment on table public.review_sms_prompt_queue is
  'Deferred review SMS queue retained for future governed SMS re-enable. P3-13 disables database auto-enqueue while customer SMS policy is off and bounds future delivery retries.';

commit;
