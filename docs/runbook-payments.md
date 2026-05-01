# Runbook: Payments & bookings (Paystack + Supabase)

## Case: Customer paid but booking not visible

1. In Paystack Dashboard, search the transaction by **reference** or customer email; confirm `success` and note **amount** and **reference**.
2. In Supabase SQL editor, run `supabase/queries/ops_support_payments_day7.sql` (section: failed / integrity states) or:

   ```sql
   select id, paystack_reference, status, lifecycle_issue, updated_at
   from public.bookings
   where paystack_reference = '<REFERENCE>';
   ```

3. Interpret `status`:
   - **`pending_payment`** — row created at init; payment may not have finalized or verify/webhook did not run. Re-run verify from client or check `failed_jobs` for `booking_insert` / `booking_finalize`.
   - **`payment_mismatch`** — charged ZAR does not match immutable checkout `price_snapshot`. Ops: reconcile with customer; adjust row only per finance policy.
   - **`payment_reconciliation_required`** — Paystack succeeded but finalization threw after charge. Row exists; inspect `system_logs` and `failed_jobs` (`booking_finalize`).
   - **`pending`** (or other normal statuses) — booking exists; customer should see it in app; check auth email vs `customer_email`.

4. Check application logs for JSON lines with `"event":"payment_finalize"` or `"event":"payment_mismatch"` and the same `reference`.

---

## Case: Duplicate customer emails

1. Confirm product expectation: one **customer** confirmation per booking/channel (`notification_idempotency_claims` + Day 5 dedupe).
2. Query `notification_logs`:

   ```sql
   select id, booking_id, event_type, channel, status, created_at, recipient
   from public.notification_logs
   where booking_id = '<BOOKING_UUID>'
   order by created_at desc;
   ```

3. Check dedupe claims:

   ```sql
   select * from public.notification_idempotency_claims
   where booking_id = '<BOOKING_UUID>';
   ```

4. If `notification_logs` shows duplicate **sent** rows for the same `event_type` + `channel`, treat as incident; review server paths that bypass `notifyBookingEvent`.

---

## Case: Missing reminders / lifecycle emails

1. For the booking:

   ```sql
   select id, lifecycle_issue, date, time, customer_email
   from public.bookings
   where id = '<BOOKING_UUID>';
   ```

2. If `lifecycle_issue = true`, inspect `system_logs` where `source = 'booking_lifecycle'` or message contains `Reminder job scheduling failed`.

3. Check `booking_lifecycle_jobs` for the booking:

   ```sql
   select * from public.booking_lifecycle_jobs
   where booking_id = '<BOOKING_UUID>'
   order by scheduled_for;
   ```

4. Cron `/api/cron/retry-failed-jobs` retries failed lifecycle rows and repairs rows with `lifecycle_issue` when inserts succeed.

5. Application logs: search for `"event":"lifecycle_failed"` with `booking_id`.

---

## Case: Referral discount disputes

1. Redemption audit:

   ```sql
   select * from public.referral_discount_redemptions
   where referral_code = '<CODE>'
   order by created_at desc;
   ```

2. If booking has `referral_reconciliation_required`, treat as finance + eng review per referral migrations.

---

## Metrics table (optional)

If migration `20260867_system_metrics.sql` is applied, mismatch counters appear as `metric = 'pricing.mismatch'`. Query recent rows:

```sql
select * from public.system_metrics
where metric like 'pricing.%'
order by created_at desc
limit 50;
```
