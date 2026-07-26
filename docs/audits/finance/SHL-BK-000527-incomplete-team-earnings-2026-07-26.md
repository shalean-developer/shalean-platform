# SHL-BK-000527 — incomplete team earnings investigation

**Status:** Investigation only. No payout redistribution. Do not treat dashboard profit for this booking as trusted until authoritative team totals exist.

**Date:** 2026-07-26  
**Booking reference:** `SHL-BK-000527`

## Why this booking is special

Confirmed production context: this booking is a team job **without authoritative `team_job_member_payouts` rows**. Historical team totals for other bookings were backfilled into `bookings.cleaner_earnings_total_cents` from `team_job_member_payouts`. That backfill path cannot produce a trusted total when member payout records are missing.

## Expected dashboard behaviour after this fix

| Field | Behaviour |
|-------|-----------|
| `is_team_job` | `true` |
| `cleaner_earnings_total_cents` | Expected `null` (or otherwise incomplete) |
| Cleaner cost on profitability | **Not** `display_earnings_cents` |
| Row warning | `Incomplete team earnings` |
| Trusted net-profit totals | **Excluded** |

This is intentional: the Office profitability dashboard must not invent a team cost from the lead cleaner’s `display_earnings_cents`.

## Read-only verification SQL

Run against production (service role / finance read path). Do **not** UPDATE payout tables.

```sql
-- 1) Booking identity + earnings columns
SELECT
  id,
  booking_reference,
  date,
  status,
  is_team_job,
  team_id,
  team_member_count_snapshot,
  cleaner_id,
  payout_owner_cleaner_id,
  display_earnings_cents,
  cleaner_payout_cents,
  cleaner_earnings_total_cents,
  cleaner_line_earnings_finalized_at
FROM bookings
WHERE booking_reference = 'SHL-BK-000527';

-- 2) Authoritative team member payout ledger (expected empty / missing)
SELECT
  id,
  booking_id,
  cleaner_id,
  team_id,
  payout_cents,
  created_at
FROM team_job_member_payouts
WHERE booking_id = (
  SELECT id FROM bookings WHERE booking_reference = 'SHL-BK-000527' LIMIT 1
);

-- 3) Optional: line-item ledger (diagnostic only; not used to silently invent profit)
SELECT
  id,
  booking_id,
  cleaner_id,
  cleaner_earnings_cents,
  item_type,
  slug
FROM booking_line_items
WHERE booking_id = (
  SELECT id FROM bookings WHERE booking_reference = 'SHL-BK-000527' LIMIT 1
);
```

## Findings (to be filled after SQL run)

| Check | Result |
|-------|--------|
| Booking found | _pending — Supabase MCP unavailable in this session_ |
| `is_team_job` | _pending_ |
| `display_earnings_cents` | _pending_ |
| `cleaner_earnings_total_cents` | _pending_ |
| `team_job_member_payouts` row count | _pending — expected 0_ |
| Safe to include in trusted profit? | **No**, until authoritative team payouts exist |

## Recommended follow-up (out of scope for this PR)

1. Confirm whether the job was completed as a team without member payout finalize.
2. Reconstruct member payouts only from an approved finance/ops process — **not** from profitability UI.
3. After authoritative rows exist, backfill `cleaner_earnings_total_cents` the same way as other historical team jobs.
4. Re-include the booking in trusted profitability totals once `cleaner_earnings_total_cents` is non-null.

## Explicit non-goals

- Do not change or redistribute individual cleaner payouts in this PR.
- Do not fall back to `display_earnings_cents` for this booking’s profitability cleaner cost.
