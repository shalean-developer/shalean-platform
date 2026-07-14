-- Lifecycle email eligibility: marketing opt-out + pending rebook job cleanup.

alter table public.user_profiles
  add column if not exists marketing_emails_unsubscribed_at timestamptz;

comment on column public.user_profiles.marketing_emails_unsubscribed_at is
  'When set, customer opted out of marketing lifecycle emails (rebook_offer, rebook_reminder). Does not block reminder_24h or review_request.';

-- Skip pending rebook jobs for recurring-plan customers (audit history preserved).
update public.booking_lifecycle_jobs j
set
  status = 'skipped',
  skipped_reason = 'customer_has_active_recurring_plan_or_future_booking',
  processed_at = now(),
  last_error = null
where j.status = 'pending'
  and j.job_type in ('rebook_offer', 'rebook_reminder')
  and (
    exists (
      select 1
      from public.bookings b
      where b.id = j.booking_id
        and (b.recurring_id is not null or b.is_recurring_generated = true)
    )
    or (
      j.user_id is not null
      and exists (
        select 1
        from public.recurring_bookings rb
        where rb.customer_id = j.user_id
          and rb.status in ('active', 'paused')
      )
    )
  );

-- Skip pending rebook jobs when the customer already has another future paid booking.
update public.booking_lifecycle_jobs j
set
  status = 'skipped',
  skipped_reason = 'customer_has_active_recurring_plan_or_future_booking',
  processed_at = now(),
  last_error = null
where j.status = 'pending'
  and j.job_type in ('rebook_offer', 'rebook_reminder')
  and exists (
    select 1
    from public.bookings future_b
    where future_b.id <> j.booking_id
      and future_b.status in ('pending', 'pending_assignment', 'assigned', 'in_progress')
      and future_b.payment_status in ('success', 'pending_monthly')
      and future_b.date is not null
      and future_b.date ~ '^\d{4}-\d{2}-\d{2}$'
      and future_b.date >= to_char((current_date at time zone 'Africa/Johannesburg')::date, 'YYYY-MM-DD')
      and (
        (j.user_id is not null and future_b.user_id = j.user_id)
        or (
          j.user_id is null
          and lower(trim(future_b.customer_email)) = lower(trim(j.customer_email))
        )
      )
  );
