# AUDIT-02A06 — Historical pricing-version provenance

Status: **Closeout pending governance merge and review-thread resolution**

Date: 2026-10-12

## Disposition

- Severity: **Medium historical integrity debt**
- Release blocker: **No**, because the active Booking V2 write/finalization path now preserves pricing-version provenance and read-only production reconciliation found no new missing rows since 2026-10-07.
- Security impact: **None identified**. This is financial/audit provenance debt, not an authorization, confidentiality, integrity-control bypass, or secret-handling defect.
- Financial mutation risk: **High if repaired without proof**. A guessed backfill would manufacture historical provenance.
- Required validation: preserve the explicit 53-row exception population, verify no new rows regress, and require immutable booking-level evidence before any future historical repair.
- Recommended next action: **accept the 53 rows as governed unprovable historical exceptions and do not backfill `pricing_version_id`**. Continue Stage 02 with the next fresh bounded audit item.

## Scope

Bounded Stage 02 source-of-truth reconstruction for historical Booking V2 rows with a missing `bookings.pricing_version_id`.

No booking, payment, payout, invoice, accounting, or pricing data was modified during this audit.


## Inspectable evidence

Audit timestamp: **2026-10-12T00:30Z–00:37Z**

Inspected application sources:
- current `main` at the start of closeout: `608c7c84f066345566ef1ba2449580cd9d2e9292`
- current production runtime immediately before this closeout: `b6949f90b2ed7b464446b1e99005e068c4c270d7`
- production Supabase project: `paqjwfulwywtsyyvdxrq`

All database inspection below was read-only.

### Query A — historical Booking V2 population

```sql
select
  count(*)::int as bv2_total,
  count(*) filter (where pricing_version_id is null)::int as bv2_missing_pricing_version,
  count(*) filter (
    where pricing_version_id is null
      and created_at >= '2026-10-07'::timestamptz
  )::int as missing_since_oct7,
  count(*) filter (
    where pricing_version_id is null
      and lower(coalesce(payment_status,'')) in ('success','paid','succeeded')
  )::int as paid_missing
from public.bookings
where lower(coalesce(paystack_reference,'')) like 'bv2_%';
```

Observed aggregate result:

```text
bv2_total=53
bv2_missing_pricing_version=53
missing_since_oct7=0
paid_missing=52
```

### Query B — surviving snapshot provenance

```sql
select
  count(*)::int as missing_total,
  count(*) filter (
    where nullif(trim(coalesce(price_snapshot->>'pricing_version_id','')), '') is not null
  )::int as price_snapshot_has_version,
  count(*) filter (
    where nullif(trim(coalesce(booking_snapshot->>'pricing_version_id','')), '') is not null
  )::int as booking_snapshot_top_has_version,
  count(*) filter (
    where nullif(trim(coalesce(booking_snapshot #>> '{locked,pricing_version_id}','')), '') is not null
  )::int as booking_snapshot_locked_has_version,
  count(*) filter (
    where nullif(trim(coalesce(booking_snapshot #>> '{price_snapshot,pricing_version_id}','')), '') is not null
  )::int as booking_snapshot_nested_price_has_version
from public.bookings
where lower(coalesce(paystack_reference,'')) like 'bv2_%'
  and pricing_version_id is null;
```

Observed aggregate result:

```text
missing_total=53
price_snapshot_has_version=0
booking_snapshot_top_has_version=0
booking_snapshot_locked_has_version=0
booking_snapshot_nested_price_has_version=0
```

### Query C — line-item provenance

```sql
with target as (
  select id
  from public.bookings
  where lower(coalesce(paystack_reference,'')) like 'bv2_%'
    and pricing_version_id is null
),
lines as (
  select bli.*
  from public.booking_line_items bli
  join target t on t.id=bli.booking_id
)
select
  (select count(*) from target)::int as target_bookings,
  count(distinct booking_id)::int as bookings_with_lines,
  count(*) filter (
    where nullif(trim(coalesce(metadata->>'pricing_version_id','')), '') is not null
  )::int as lines_with_pricing_version,
  count(distinct booking_id) filter (
    where nullif(trim(coalesce(metadata->>'pricing_version_id','')), '') is not null
  )::int as bookings_with_line_version
from lines;
```

Observed aggregate result:

```text
target_bookings=53
bookings_with_lines=28
lines_with_pricing_version=0
bookings_with_line_version=0
```

### Query D — Paystack raw payload provenance

```sql
with target as (
  select id, paystack_reference
  from public.bookings
  where lower(coalesce(paystack_reference,'')) like 'bv2_%'
    and pricing_version_id is null
),
pt as (
  select t.id as booking_id, p.raw_gateway_payload
  from target t
  join public.payment_transactions p
    on p.booking_id=t.id
    or (p.entity_type='booking' and p.entity_id=t.id)
    or p.gateway_reference=t.paystack_reference
)
select
  (select count(*) from target)::int as target_total,
  count(distinct booking_id)::int as with_payment_tx,
  count(distinct booking_id) filter (
    where raw_gateway_payload::text ilike '%pricing_version%'
  )::int as tx_payload_mentions_pricing_version
from pt;
```

Observed aggregate result:

```text
target_total=53
with_payment_tx=53
tx_payload_mentions_pricing_version=0
```

### Query E — config-hash evidence

```sql
with target as (
  select id, paystack_reference, price_snapshot, booking_snapshot, metadata, pricing_summary, price_breakdown
  from public.bookings
  where lower(coalesce(paystack_reference,'')) like 'bv2_%'
    and pricing_version_id is null
),
booking_hash as (
  select id
  from target
  where price_snapshot::text ilike '%config_hash%'
     or booking_snapshot::text ilike '%config_hash%'
     or metadata::text ilike '%config_hash%'
     or pricing_summary::text ilike '%config_hash%'
     or price_breakdown::text ilike '%config_hash%'
),
tx_hash as (
  select distinct t.id
  from target t
  join public.payment_transactions p
    on p.booking_id=t.id
    or (p.entity_type='booking' and p.entity_id=t.id)
    or p.gateway_reference=t.paystack_reference
  where p.raw_gateway_payload::text ilike '%config_hash%'
)
select
  (select count(*) from target)::int as target_total,
  (select count(*) from booking_hash)::int as booking_hash_evidence,
  (select count(*) from tx_hash)::int as payment_hash_evidence;
```

Observed aggregate result:

```text
target_total=53
booking_hash_evidence=0
payment_hash_evidence=0
```

### Query F — quote linkage and creation window

```sql
select
  count(*)::int as target_total,
  count(*) filter (where quote_id is not null)::int as with_quote_id,
  min(created_at) as earliest_booking,
  max(created_at) as latest_booking
from public.bookings
where lower(coalesce(paystack_reference,'')) like 'bv2_%'
  and pricing_version_id is null;
```

Observed aggregate result:

```text
target_total=53
with_quote_id=0
earliest_booking=2026-06-16T09:21:39.552288Z
latest_booking=2026-09-13T10:25:39.793794Z
```

### Query G — timestamp-only candidate mapping

```sql
with v as (
  select id, created_at,
         lead(created_at) over(order by created_at) as next_created_at
  from public.pricing_versions
),
t as (
  select id, created_at
  from public.bookings
  where lower(coalesce(paystack_reference,'')) like 'bv2_%'
    and pricing_version_id is null
)
select
  v.id as candidate_version_id,
  count(t.id)::int as booking_count
from v
left join t
  on t.created_at >= v.created_at
 and (v.next_created_at is null or t.created_at < v.next_created_at)
group by v.id, v.created_at, v.next_created_at
having count(t.id) > 0
order by v.created_at;
```

Observed aggregate result:

```text
53bacad9-8598-4b07-8fad-861ed7600531 => 1 booking
b29caefd-818e-4a09-86cb-457cc9702620 => 52 bookings
```

This query is retained only to document why a tempting backfill exists. It is explicitly **not** accepted as provenance.

### Repository-history evidence

Git history for `apps/web/app/api/booking-v2` shows:
- `72866c87f47e...` on 2026-09-22: “persist frozen pricing version on booking v2”
- `fae63c36099c...` on 2026-09-22: “sign and version booking quote locks”
- `60f6aa3524c9...` on 2026-10-08: “embed pricing version in booking v2 snapshot”

All 53 target bookings predate the 2026-09-22 provenance mechanism.

## Production population

Read-only production audit on Supabase project `paqjwfulwywtsyyvdxrq` found:

- Booking V2 rows with `paystack_reference LIKE 'bv2_%'`: 53
- Rows with `pricing_version_id IS NULL`: 53
- Paid/settled rows among them: 52
- New missing rows since 2026-10-07: 0
- Creation window: 2026-06-16 through 2026-09-13

## Immutable provenance sources checked

The 53 rows were checked against every surviving durable source that could prove an exact pricing-version identity:

- `bookings.price_snapshot`
- `bookings.booking_snapshot`
- nested `booking_snapshot.locked`
- nested snapshot pricing fields
- `bookings.metadata`
- `bookings.pricing_summary`
- `bookings.price_breakdown`
- `bookings.service_details`
- `booking_line_items.metadata`
- `booking_changes`
- `failed_jobs.payload`
- `payment_transactions.raw_gateway_payload`
- booking/payment payload `config_hash` evidence
- surviving `bookings.quote_id`

Results:

- pricing-version ID evidence in booking snapshots/metadata: 0/53
- pricing-version ID evidence in line items: 0/53
- pricing-version evidence in booking-change history: 0/53
- pricing-version evidence in failed-job/recovery payloads: 0/53
- payment transactions present: 53/53
- pricing-version evidence in Paystack raw payloads: 0/53
- config-hash evidence in booking/payment payloads: 0/53
- surviving quote_id: 0/53

Only 28/53 historical rows have normalized booking line items, and none of those line items carries a pricing-version identifier.

## Pricing-version ledger context

The production `pricing_versions` table contains historical version rows, so a version can be inferred by booking timestamp.

Timestamp-only candidate grouping yields:

- 1 booking falls after pricing version `53bacad9-8598-4b07-8fad-861ed7600531` and before the next version.
- 52 bookings fall after pricing version `b29caefd-818e-4a09-86cb-457cc9702620` and before the next version.

This is **not proof** of which pricing version was frozen for an individual booking.

A historical quote may have been created earlier and confirmed later, and there is no surviving booking-level signed lock, version ID, config hash, or immutable request payload tying these rows to those candidate versions.

## Historical code timeline

Repository history shows:

- 2026-09-22: Booking V2 began persisting the frozen pricing version.
- 2026-09-22: signed/versioned quote locks were introduced.
- 2026-10-08: Booking V2 snapshot embedding of pricing version was hardened further.

All 53 target bookings predate the 2026-09-22 provenance mechanism.

## Classification

- **Provable exact pricing-version IDs: 0/53**
- **Unprovable historical rows: 53/53**

## Decision

**Do not backfill `pricing_version_id` on these 53 historical bookings.**

Assigning a pricing version from booking creation time would manufacture financial provenance rather than reconstruct an immutable historical fact.

These rows are retained as explicit historical exceptions with unknown pricing-version provenance.

## Current-path status

The active Booking V2 write/finalization path now:

- persists `pricing_version_id` on the pending booking;
- preserves the persisted value during Paystack finalization;
- stamps the resolved version back into the immutable checkout price snapshot.

Read-only production reconciliation found **0 new missing Booking V2 pricing-version rows since 2026-10-07**.

## Closure

AUDIT-02A06 is closed without a financial repair.

No staging fixture mutation, production backfill, payout change, invoice change, payment change, or accounting change is authorized by this closeout.

Any future historical repair attempt must first produce new immutable booking-level provenance evidence. Timestamp inference alone is explicitly insufficient.
