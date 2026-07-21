# PAYOUT-E2E-001 — Database Integrity Report

## Status

| Item | Status |
|------|--------|
| Production read-only queries executed | **BLOCKED** — Supabase MCP auth/discovery failed (timeout) |
| Staging fixture mutation tests | **BLOCKED** — no authorized staging admin session / DB write for fixtures |
| Queries published for ops execution | Yes (this file) |
| Data repaired during audit | **No** |

**Supabase identities (from ENV-01 inventory; verify before running):**

| Env | Project ref |
|-----|-------------|
| Production | `tchayecuvzssixyxlvfu` |
| Staging | `gfvdiczqyrvlmynvgegd` |

Run only with a **read-only** role. Redact bank details and PII in exported samples.

---

## 1. Known instance probe (blocked)

```sql
-- Cleaner from known editCleaner URL — July 2026 visits
-- cleaner_id = '914b3acf-40e8-4ad5-a5a2-9e2de711849a'

WITH visits AS (
  SELECT b.id, b.date, b.is_team_job, b.cleaner_id, b.payout_owner_cleaner_id,
         b.cleaner_payout_cents, b.display_earnings_cents, b.cleaner_earnings_total_cents,
         b.payout_frozen_cents, b.payout_status, b.payout_id,
         b.earnings_summary
  FROM bookings b
  WHERE b.status = 'completed' AND COALESCE(b.is_test, false) = false
    AND b.date BETWEEN '2026-07-01' AND '2026-07-31'
)
SELECT v.*,
       (SELECT count(*) FROM booking_cleaners bc WHERE bc.booking_id = v.id) AS roster_count,
       (SELECT count(*) FROM team_job_member_payouts t WHERE t.booking_id = v.id) AS tj_count,
       (SELECT count(*) FROM booking_roster_member_payouts r WHERE r.booking_id = v.id) AS roster_pay_count
FROM visits v
WHERE v.cleaner_id = '914b3acf-40e8-4ad5-a5a2-9e2de711849a'
   OR v.payout_owner_cleaner_id = '914b3acf-40e8-4ad5-a5a2-9e2de711849a'
   OR EXISTS (
        SELECT 1 FROM booking_cleaners bc
        WHERE bc.booking_id = v.id AND bc.cleaner_id = '914b3acf-40e8-4ad5-a5a2-9e2de711849a'
      )
   OR EXISTS (
        SELECT 1 FROM team_job_member_payouts t
        WHERE t.booking_id = v.id AND t.cleaner_id = '914b3acf-40e8-4ad5-a5a2-9e2de711849a'
      )
   OR (v.earnings_summary::text LIKE '%914b3acf-40e8-4ad5-a5a2-9e2de711849a%')
ORDER BY v.date;
```

**Expected evidence to close F02 instance:** rows with `is_team_job = false` and TJ membership, or summary missing requested cleaner while TJ present.

---

## 2. Integrity query pack (record counts + sample IDs)

### 2.1 Completed bookings without cleaner allocation signal

```sql
SELECT count(*) AS cnt
FROM bookings b
WHERE b.status = 'completed' AND COALESCE(b.is_test, false) = false
  AND b.cleaner_id IS NULL
  AND b.payout_owner_cleaner_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM booking_cleaners bc WHERE bc.booking_id = b.id)
  AND NOT EXISTS (SELECT 1 FROM team_job_member_payouts t WHERE t.booking_id = b.id)
  AND (b.earnings_summary IS NULL OR COALESCE(jsonb_array_length(b.earnings_summary->'per_cleaner_earnings'),0) = 0);
```

### 2.2 Multi-cleaner roster but `is_team_job = false`

```sql
SELECT b.id, b.date, b.cleaner_id, count(bc.cleaner_id) AS roster_n
FROM bookings b
JOIN booking_cleaners bc ON bc.booking_id = b.id
WHERE b.status = 'completed' AND COALESCE(b.is_test, false) = false
  AND COALESCE(b.is_team_job, false) = false
GROUP BY b.id, b.date, b.cleaner_id
HAVING count(bc.cleaner_id) > 1
ORDER BY b.date DESC
LIMIT 50;
```

### 2.3 `is_team_job = true` with ≤1 roster cleaner

```sql
SELECT b.id, b.date, count(bc.cleaner_id) AS roster_n
FROM bookings b
LEFT JOIN booking_cleaners bc ON bc.booking_id = b.id
WHERE b.status = 'completed' AND COALESCE(b.is_test, false) = false
  AND b.is_team_job = true
GROUP BY b.id, b.date
HAVING count(bc.cleaner_id) <= 1
LIMIT 50;
```

### 2.4 Summary cleaners absent from roster / roster absent from summary

```sql
-- Summary member not on roster
SELECT b.id, e->>'cleaner_id' AS summary_cleaner
FROM bookings b
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(b.earnings_summary->'per_cleaner_earnings','[]'::jsonb)) e
WHERE b.status = 'completed' AND COALESCE(b.is_test, false) = false
  AND NOT EXISTS (
    SELECT 1 FROM booking_cleaners bc
    WHERE bc.booking_id = b.id AND bc.cleaner_id = (e->>'cleaner_id')::uuid
  )
LIMIT 50;

-- Roster member not in summary (when summary present)
SELECT b.id, bc.cleaner_id
FROM bookings b
JOIN booking_cleaners bc ON bc.booking_id = b.id
WHERE b.status = 'completed' AND COALESCE(b.is_test, false) = false
  AND b.earnings_summary IS NOT NULL
  AND COALESCE(jsonb_array_length(b.earnings_summary->'per_cleaner_earnings'),0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(b.earnings_summary->'per_cleaner_earnings') e
    WHERE e->>'cleaner_id' = bc.cleaner_id::text
  )
LIMIT 50;
```

### 2.5 TJ rows missing from summary / summary missing TJ

```sql
SELECT t.booking_id, t.cleaner_id, t.payout_cents, b.is_team_job
FROM team_job_member_payouts t
JOIN bookings b ON b.id = t.booking_id
WHERE NOT EXISTS (
  SELECT 1 FROM jsonb_array_elements(COALESCE(b.earnings_summary->'per_cleaner_earnings','[]'::jsonb)) e
  WHERE e->>'cleaner_id' = t.cleaner_id::text
)
LIMIT 50;
```

**This set is the live footprint of F02.**

### 2.6 Top-level earnings ≠ summary total

```sql
SELECT b.id,
       b.display_earnings_cents,
       b.cleaner_payout_cents + COALESCE(b.cleaner_bonus_cents,0) AS hybrid,
       (b.earnings_summary->>'total_cleaner_earnings_cents')::int AS summary_total
FROM bookings b
WHERE b.earnings_summary IS NOT NULL
  AND b.status = 'completed' AND COALESCE(b.is_test, false) = false
  AND COALESCE(b.is_team_job, false) = false
  AND COALESCE(b.cleaner_payout_cents,0) + COALESCE(b.cleaner_bonus_cents,0)
      <> COALESCE((b.earnings_summary->>'total_cleaner_earnings_cents')::int, -1)
LIMIT 50;
```

### 2.7 Negative earnings / above naive revenue

```sql
SELECT id, cleaner_payout_cents, display_earnings_cents, company_revenue_cents
FROM bookings
WHERE status = 'completed' AND COALESCE(is_test, false) = false
  AND (
    COALESCE(cleaner_payout_cents,0) < 0
    OR COALESCE(display_earnings_cents,0) < 0
    OR COALESCE(company_revenue_cents,0) < 0
  );
```

### 2.8 Duplicate booking across payout batches

```sql
-- A booking has one payout_id; detect member rows pointing at different batches than booking
SELECT b.id AS booking_id, b.payout_id AS booking_payout_id,
       t.cleaner_id, t.cleaner_payout_id AS tj_payout_id
FROM bookings b
JOIN team_job_member_payouts t ON t.booking_id = b.id
WHERE b.payout_id IS NOT NULL
  AND t.cleaner_payout_id IS NOT NULL
  AND t.cleaner_payout_id <> b.payout_id
LIMIT 50;
```

### 2.9 Duplicate transfer references

```sql
SELECT reference, count(*) AS n
FROM payout_transfers
WHERE reference IS NOT NULL
GROUP BY reference
HAVING count(*) > 1;
```

### 2.10 Transfer success vs local paid mismatch

```sql
-- Success transfer but batch not paid
SELECT pt.id, pt.reference, pt.status, cp.id AS payout_id, cp.status AS batch_status
FROM payout_transfers pt
JOIN cleaner_payouts cp ON cp.id::text = replace(pt.reference, 'payout_', '') -- adjust join to actual schema linkage
WHERE pt.status = 'success' AND cp.status <> 'paid'
LIMIT 50;
```

> **Note:** Join predicate must match production schema (`subject_id` / `cleaner_payout_id` columns). Inspect `payout_transfers` columns before running; adjust join accordingly. Do not invent joins in production execution.

### 2.11 Paid batch without success transfer

```sql
SELECT cp.id, cp.status, cp.total_amount_cents
FROM cleaner_payouts cp
WHERE cp.status = 'paid'
  AND NOT EXISTS (
    SELECT 1 FROM payout_transfers pt
    WHERE pt.status = 'success'
      AND pt.cleaner_payout_id = cp.id  -- confirm column name
  )
LIMIT 50;
```

### 2.12 Stale pending outbox

```sql
SELECT id, status, reference, created_at, updated_at
FROM payout_transfer_outbox
WHERE status IN ('pending', 'needs_reconcile', 'submitted')
  AND created_at < now() - interval '48 hours'
ORDER BY created_at
LIMIT 100;
```

### 2.13 Zero-booking payout batches

```sql
SELECT cp.id, cp.cleaner_id, cp.period_start, cp.period_end, cp.total_amount_cents, cp.status
FROM cleaner_payouts cp
WHERE NOT EXISTS (SELECT 1 FROM bookings b WHERE b.payout_id = cp.id)
  AND NOT EXISTS (SELECT 1 FROM team_job_member_payouts t WHERE t.cleaner_payout_id = cp.id)
  AND NOT EXISTS (SELECT 1 FROM booking_roster_member_payouts r WHERE r.cleaner_payout_id = cp.id)
LIMIT 50;
```

### 2.14 Pseudo-team edit-risk population

```sql
SELECT count(*) AS pseudo_team_risk_cnt
FROM bookings b
WHERE b.status = 'completed' AND COALESCE(b.is_test, false) = false
  AND COALESCE(b.is_team_job, false) = false
  AND (
    EXISTS (SELECT 1 FROM team_job_member_payouts t WHERE t.booking_id = b.id)
    OR COALESCE(jsonb_array_length(b.earnings_summary->'per_cleaner_earnings'),0) > 1
    OR (SELECT count(*) FROM booking_cleaners bc WHERE bc.booking_id = b.id) > 1
  );
```

---

## 3. Results table (to fill after SQL run)

| Check | Count | Sample IDs | Notes |
|-------|------:|------------|-------|
| 2.1 no allocation | — | | BLOCKED |
| 2.2 multi roster / not team | — | | BLOCKED |
| 2.3 team / ≤1 roster | — | | BLOCKED |
| 2.5 TJ missing from summary | — | | BLOCKED — priority |
| 2.14 pseudo-team risk | — | | BLOCKED — priority |
| Known cleaner July visits | — | | BLOCKED |

---

## 4. Code-level integrity conclusions (without live counts)

Even without live counts, the schema + application code **guarantees** the following inconsistency classes are possible and already unit-tested in one case (TJ member missing from summary still allocated in office):

1. Office allocation ⊇ TJ ∪ summary ∪ roster  
2. Solo edit ⊆ booking hybrid ∪ optional summary  
3. Therefore office − solo write ≠ ∅ for TJ-only members  

This is sufficient for **NO-GO** on edit integrity pending live magnitude measurement.
