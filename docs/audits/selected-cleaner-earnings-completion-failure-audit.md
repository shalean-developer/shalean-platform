# Selected cleaner, zero earnings, and completion failure — chain audit

**Date:** 2026-05-10  
**Scope:** Trace the broken invariant from customer-selected cleaner → admin visibility → admin assignment → earnings → cleaner complete. No payout architecture refactor; no blind merge of `selected_cleaner_id` and `cleaner_id`.

---

## Executive summary

Observed behavior matches a **two-part server/UI contract bug** plus **intentional payout reset on reassignment** without a guaranteed early recompute:

1. **Customer flow** writes the preferred cleaner on `bookings.selected_cleaner_id` (and `assignment_type: user_selected`) but does **not** put that UUID on `locked.cleaner_id` in the persisted `booking_snapshot`.
2. **Paystack finalize** (`upsertBookingFromPaystack`) derives “user confirmed cleaner” only via `pickUserSelectedCleanerId`, which reads **`locked.cleaner_id` or top-level `snapshot.cleaner_id` only** — not `bookings.selected_cleaner_id`. When both are absent, checkout resolution is `no_pick`, and the finalize patch **explicitly clears** `selected_cleaner_id` (and `cleaner_id`) on the row. That can **erase** the customer’s pick that flow-intake had set.
3. **Admin list** labels “Selected at checkout” from **`attempted_cleaner_id`**, not `selected_cleaner_id`. If finalize cleared both `selected_cleaner_id` and never set `attempted_cleaner_id`, admin sees **no** selected-cleaner signal.
4. **Admin PATCH** changing `cleaner_id` applies **`BOOKING_PAYOUT_COLUMNS_CLEAR`**, then **`resetBookingCleanerLineEarnings`**, which sets **`display_earnings_cents`** and related fields to **`null`** and clears line/ledger pending rows. There is **no** synchronous `persistCleanerPayoutIfUnset` on that path.
5. **Cleaner job UI** often resolves “earnings” via **`resolveCleanerEarningsCents`**, which returns **`null`** when line total, frozen, and display are all unset — often presented as **R0 / 0**.
6. **Complete** (`runCleanerBookingLifecycleAction` → `action === "complete"`) calls **`persistCleanerPayoutIfUnset`**, then **`hasPersistedDisplayEarningsBasis`** on a refetched `display_earnings_cents`. If persist fails or leaves display **`null`**, completion returns **500** with payout-related codes — i.e. the cleaner can progress through accept / en-route / start but **cannot** complete.

**Primary ranked root cause (most likely):** Paystack finalize **clears `selected_cleaner_id`** because `pickUserSelectedCleanerId` **does not consider** the column the flow already wrote, combined with admin UI **not surfacing `selected_cleaner_id`**.  
**Secondary:** Admin reassignment **nulls earnings**; if `persistCleanerPayoutIfUnset` does not successfully repopulate `display_earnings_cents` before complete (data shape, caps, team rules, or cleaner mismatch), **completion is blocked by design**.

---

## 1. Why is the selected cleaner hidden from admin?

### Customer booking flow — fields

| Field / table | Role in this story |
|---------------|---------------------|
| `bookings.selected_cleaner_id` | Set in flow intake when customer picks a cleaner. |
| `bookings.cleaner_id` | Assigned cleaner (null until assign/accept paths). |
| `booking_snapshot.locked` | Persisted lock from Step1; **does not** receive `selected_cleaner_id` in flow intake. |
| `dispatch_offers` | Used for offer/accept funnel for user-selected path after finalize; not the visibility bug by itself. |
| `cleaner_response_status` / `dispatch_status` | Lifecycle; admin list uses them for dispatch UX. |
| `attempted_cleaner_id` | Set on auto-fallback from checkout selection; **admin “Selected at checkout” uses this**. |

### Is `selected_cleaner_id` written during customer booking?

**Yes** — after `insertPendingPaymentBookingRow`, flow intake updates the pending row when `preferred` is a valid UUID:

```234:236:apps/web/lib/booking/insertBookingFlowIntake.ts
      ...(preferred
        ? { selected_cleaner_id: preferred, assignment_type: "user_selected" as const, cleaner_id: null }
        : {}),
```

The `LockedBooking` built from step1 **does not** set `cleaner_id` from `selected_cleaner_id`:

```152:163:apps/web/lib/booking/insertBookingFlowIntake.ts
  const locked: LockedBooking = {
    ...step1,
    date,
    time,
    finalPrice: Math.round(totalZar),
    finalHours: Number.isFinite(hours) ? hours : 0,
    surge: 1,
    locked: true,
    lockedAt,
    pricing_version_id: pricingVersionId,
  };
```

### Is it overwritten or ignored after Paystack finalize?

**Risk: yes, explicit clear on finalize** when `userConfirmedCleanerId` is null:

```324:331:apps/web/lib/booking/upsertBookingFromPaystack.ts
  const pickedCleanerUuid = pickUserSelectedCleanerId(lockedRow, input.snapshot);
  const checkoutResolution = await resolveCheckoutCleanerSelection(supabase, {
    pickedCleanerUuid,
    locked: lockedRow,
  });
  let userConfirmedCleanerId: string | null =
    checkoutResolution.kind === "honor" ? checkoutResolution.cleanerId : null;
```

```502:509:apps/web/lib/booking/upsertBookingFromPaystack.ts
    /**
     * `bookings_assigned_requires_status` forbids `status = pending` with stale `cleaner_id` /
     * `selected_cleaner_id` from the pre-pay row. UPDATE must clear them unless this finalize
     * sets user-selected checkout fields via {@link userSelectedCheckoutRow}.
     */
    ...(userConfirmedCleanerId == null ? { cleaner_id: null, selected_cleaner_id: null } : {}),
    ...checkoutIntentRow,
    ...userSelectedCheckoutRow,
```

`pickUserSelectedCleanerId` **only** reads lock + snapshot top-level `cleaner_id`:

```18:25:apps/web/lib/booking/userSelectedCleanerFromSnapshot.ts
export function pickUserSelectedCleanerId(
  lockedRow: LockedBooking | null,
  snapshot: BookingSnapshotV1 | null,
): string | null {
  const fromLocked = normalizeUuidCandidate(lockedRow?.cleaner_id ?? undefined);
  if (fromLocked) return fromLocked;
  return normalizeUuidCandidate(snapshot?.cleaner_id ?? undefined);
}
```

If `pickedCleanerUuid` is null, `resolveCheckoutCleanerSelection` returns **`no_pick`** and `userConfirmedCleanerId` stays null — so the spread above **clears** `selected_cleaner_id`.

### Admin list/detail

- **List API** (`GET` `apps/web/app/api/admin/bookings/route.ts`) **does** select `selected_cleaner_id` (along with `attempted_cleaner_id`, etc.).
- **List UI** (`BookingCard.tsx`) shows “Selected at checkout” only when **`attempted_cleaner_id`** is set **and** differs from `cleaner_id` — it does **not** read `selected_cleaner_id` for that label:

```332:337:apps/web/components/admin/BookingCard.tsx
            {r.attempted_cleaner_id?.trim() && r.attempted_cleaner_id.trim() !== (r.cleaner_id ?? "").trim() ? (
              <p className="text-[10px] leading-snug text-zinc-600 dark:text-zinc-400" title={r.attempted_cleaner_id}>
                Selected at checkout:{" "}
                {cleanerDisplayName(r.attempted_cleaner_id.trim(), sortedCleaners) ??
                  `ID ${r.attempted_cleaner_id.slice(0, 8)}…`}
```

So: **API has `selected_cleaner_id`; the card’s “selected” copy is wired to the wrong column for the user-selected happy path.**

### Admin assignment logic

`PATCH` `apps/web/app/api/admin/bookings/[id]/route.ts` can set `selected_cleaner_id` if the body includes it (`wantsPreferredCleaner`). Random assign via **`cleaner_id` only** does not recover a cleared `selected_cleaner_id`.

### Mismatch summary

| Concept | Expected mental model | Risky actual behavior |
|--------|------------------------|------------------------|
| Customer pick | Lives on `selected_cleaner_id` + snapshot | Lock/snapshot may lack `cleaner_id`; finalize may **null** `selected_cleaner_id` |
| Admin “selected” | Show customer pick | UI ties label to **`attempted_cleaner_id`** (fallback trace), not **`selected_cleaner_id`** |

---

## 2. Why did the cleaner receive the job with 0 earnings?

### Sources (conceptual)

- **`booking_line_items`**: basis for line-based earnings; `resetBookingCleanerLineEarnings` sets `cleaner_earnings_cents` **null** on reassignment.
- **`price_snapshot` / `price_breakdown`**: inputs to payout compute.
- **`display_earnings_cents` / `cleaner_payout_cents` / `cleaner_earnings_total_cents` / `payout_frozen_cents`**: persisted/display pipeline; cleared or null after reassignment until persist runs successfully.
- **`persistCleanerPayoutIfUnset`**, **`computeCleanerEarningsForBooking`**, **`ensureCleanerEarningsLedgerRow`**: completion path depends on successful persist + non-null display basis check (see §3).

### Admin reassignment path

On `cleaner_id` change:

```399:402:apps/web/app/api/admin/bookings/[id]/route.ts
  const cleanerWasChanged = "cleaner_id" in updates && newCleaner !== oldCleaner;
  if (cleanerWasChanged) {
    Object.assign(updates, BOOKING_PAYOUT_COLUMNS_CLEAR);
```

`BOOKING_PAYOUT_COLUMNS` clear (partial):

```1:8:apps/web/lib/payout/bookingPayoutColumns.ts
export const BOOKING_PAYOUT_COLUMNS_CLEAR = {
  cleaner_payout_cents: null,
  cleaner_bonus_cents: null,
  company_revenue_cents: null,
  payout_percentage: null,
  payout_type: null,
} as const;
```

Then after DB update:

```460:462:apps/web/app/api/admin/bookings/[id]/route.ts
  if (cleanerWasChanged) {
    await resetBookingCleanerLineEarnings(admin, id);
  }
```

```11:17:apps/web/lib/payout/resetBookingCleanerLineEarnings.ts
  await admin
    .from("bookings")
    .update({
      display_earnings_cents: null,
      cleaner_earnings_total_cents: null,
      cleaner_line_earnings_finalized_at: null,
    })
    .eq("id", bid);
```

**Manual admin assignment does not, in this route, immediately call `persistCleanerPayoutIfUnset`.** Earnings stay unset until another path runs (e.g. complete’s persist, cron/debounced repair, or other jobs).

### Cleaner dashboard “0”

`resolveCleanerEarningsCents` returns **`null`** when nothing positive is set:

```8:22:apps/web/lib/cleaner/resolveCleanerEarnings.ts
export function resolveCleanerEarningsCents(row: {
  cleaner_earnings_total_cents?: unknown;
  payout_frozen_cents?: unknown;
  display_earnings_cents?: unknown;
}): number | null {
  const lineTotal = optionalCentsFromDb(row.cleaner_earnings_total_cents);
  if (lineTotal !== null && lineTotal > 0) return lineTotal;

  const frozen = optionalCentsFromDb(row.payout_frozen_cents);
  const display = optionalCentsFromDb(row.display_earnings_cents);
  if (frozen !== null && frozen > 0) return frozen;
  if (frozen === 0 && display !== null && display > 0) return display;
  if (frozen !== null) return frozen;
  if (display !== null) return display;
  return null;
}
```

So **“0 earnings” in the app can mean true zero or `null` coerced in UI** — after reassignment, **`null` is the expected DB state** until persist succeeds.

### Were line items created?

Not re-verified against production data in this audit; use §6 SQL on the affected `booking_id`. If line items are missing or incompatible with `persistCleanerPayoutIfUnset`’s expectations, persist can fail and leave display null (blocking complete).

### Manual reassignment clearing without recompute

**Confirmed in code:** reassignment clears payout columns and explicitly nulls display/total via `resetBookingCleanerLineEarnings` without a same-request recompute.

---

## 3. Why could the cleaner not complete/end the job?

### Endpoint and stack

- Cleaner taps complete → typically **`POST /api/cleaner/bookings/[id]/complete`** or **`POST /api/cleaner/jobs/[id]`** with `{ "action": "complete" }`.
- `complete` route delegates to **`markBookingCompleted`** → **`runCleanerLifecycleOperation`(..., `"complete"`)** → **`runCleanerBookingLifecycleAction`** with `action === "complete"`.

```22:26:apps/web/app/api/cleaner/bookings/[id]/complete/route.ts
  const op = await markBookingCompleted({
    admin,
    cleanerId: session.cleanerId,
    bookingId: id.trim(),
  });
```

### Preconditions (high signal)

1. **`status === "in_progress"`** — otherwise **400** `COMPLETE_REQUIRES_IN_PROGRESS`:

```1160:1178:apps/web/lib/cleaner/runCleanerBookingLifecycleAction.ts
  if (action === "complete") {
    if (st !== "in_progress") {
      ...
      return {
        status: 400,
        json: {
          error: "Mark the job as started before completing.",
          code: CLEANER_LIFECYCLE_CODE.COMPLETE_REQUIRES_IN_PROGRESS,
        },
      };
    }
```

2. **`persistCleanerPayoutIfUnset`** must return success; otherwise **500** with `payout_persist_failed` (or related code).

3. After persist, **`hasPersistedDisplayEarningsBasis(displayCents)`** — **`null` fails`**; note **`0` passes`** (free/promo/test jobs):

```83:91:apps/web/lib/payout/bookingEarningsIntegrity.ts
export function hasPersistedDisplayEarningsBasis(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0;
}
```

```1196:1242:apps/web/lib/cleaner/runCleanerBookingLifecycleAction.ts
    try {
      const payout = await persistCleanerPayoutIfUnset({ admin, bookingId, cleanerId });
      if (payout.ok === false) {
        ...
        return {
          status: 500,
          json: {
            error: payout.error ?? "Could not record earnings for this job.",
            code: persistCode,
            error_id,
          },
        };
      }
      const displayCents = await fetchBookingDisplayEarningsCents(admin, bookingId);
      if (!hasPersistedDisplayEarningsBasis(displayCents)) {
```

### Does completion require non-zero earnings?

**No** — it requires a **persisted numeric basis including 0**. **`null` blocks completion.**

### Cleaner vs assigned mismatch

Lifecycle uses **`cleanerId` from session** and loads the booking; guards elsewhere enforce the authenticated cleaner is allowed for the job. If admin assigned cleaner **B** while the app still thought customer wanted **A**, that is primarily an **operations/confusion** issue, not the completion null-check — **unless** persist uses row state where `cleaner_id` / team roster does not match the session cleaner, which can cause **`persistCleanerPayoutIfUnset`** to fail internal checks (see `isCleanerAllowedForPersist` in `persistCleanerPayout.ts`).

### Policy blockers (payment / recurring)

Separate code paths exist for recurring/unpaid; this scenario was **paid booking + manual assign**. The **strongest code-aligned blocker** for “started but cannot complete” after admin shuffle is **payout persist / display null verify**.

---

## 4. Mutation path (intended vs risky)

Replace `<BOOKING_ID>` with the real UUID.

| Step | File / route | Function / handler | Reads (main) | Writes (main) | Expected | Risky actual |
|------|--------------|-------------------|--------------|---------------|----------|---------------|
| Customer flow intake | `apps/web/lib/booking/insertBookingFlowIntake.ts` | `insertBookingFromFlowIntake` | pricing, location | `insertPendingPaymentBookingRow` then `bookings` update | `selected_cleaner_id` set when preferred UUID valid | `locked` has **no** `cleaner_id` from selection |
| Pending row | `apps/web/lib/booking/insertPendingPaymentBooking.ts` (called from intake) | insert | — | `pending_payment` row | snapshot with `locked` | — |
| Paystack finalize | `apps/web/lib/booking/upsertBookingFromPaystack.ts` | `upsertBookingFromPaystack` | `lockedRow`, `input.snapshot`, existing row | `status=pending`, clears ids if no user confirm | Preserve or honor `selected_cleaner_id` | **`selected_cleaner_id: null`** if `pickUserSelectedCleanerId` null |
| Pick user cleaner | `apps/web/lib/booking/userSelectedCleanerFromSnapshot.ts` | `pickUserSelectedCleanerId` | `locked.cleaner_id`, `snapshot.cleaner_id` | — | UUID from lock/metadata | **Ignores DB `selected_cleaner_id`** |
| Checkout resolution | `apps/web/lib/booking/checkoutCleanerEligibility.ts` | `resolveCheckoutCleanerSelection` | picked UUID, cleaners table, slot | — | `honor` or `fallback` with `attempted_*` | **`no_pick`** → no `attempted_cleaner_id` |
| Admin list | `apps/web/app/api/admin/bookings/route.ts` | `GET` | many columns incl. `selected_cleaner_id` | — | UI can show pick | Data present but **UI uses `attempted_cleaner_id`** |
| Admin card | `apps/web/components/admin/BookingCard.tsx` | render | `attempted_cleaner_id`, `cleaner_id` | — | Show selected | **No line for `selected_cleaner_id`** |
| Admin assign | `apps/web/app/api/admin/bookings/[id]/route.ts` | `PATCH` | `before` row | `cleaner_id`, payout clear, lifecycle cols | New assignee | **`display_earnings_cents` → null** via reset |
| Cleaner jobs API | `apps/web/app/api/cleaner/jobs/route.ts`, `[id]/route.ts` | `GET` | booking + line items | — | Earnings resolved | **`resolveCleanerEarningsCents` → null** |
| Accept / en-route / start | `apps/web/lib/cleaner/runCleanerBookingLifecycleAction.ts` | same module | booking row | status timestamps | transitions OK | **No mandatory persist** before complete |
| Complete | `apps/web/app/api/cleaner/bookings/[id]/complete/route.ts` | `POST` → `markBookingCompleted` | session + booking | completion update | success | **500 if display null after persist** |

---

## 5. Diagnostics (safe, existing)

Finalize already supports **`TRACE_PAYSTACK_FINALIZE=1`** and metadata tracing via **`TRACE_PAYSTACK_METADATA=1`** in `upsertBookingFromPaystack.ts` (server logs). Prefer enabling those in staging rather than adding new production logs.

No code changes were made for this audit.

---

## 6. Deliverables checklist

### Root cause candidates (ranked)

1. **Finalize clears `selected_cleaner_id`** because `pickUserSelectedCleanerId` does not read the column flow-intake wrote; lock lacks `cleaner_id`. (**Highest likelihood** for “admin didn’t know the pick.”)
2. **Admin UI shows “Selected at checkout” from `attempted_cleaner_id` only**, so even a surviving `selected_cleaner_id` may be invisible in the list card. (**High** for UX gap.)
3. **Admin reassignment + `resetBookingCleanerLineEarnings`** leaves earnings **null** until persist; cleaner sees **0 / null**; **complete fails** if `persistCleanerPayoutIfUnset` does not restore `display_earnings_cents`. (**High** for zero + blocked complete.)
4. **Persist failure** (missing line items, financial cap, team/payout-owner mismatch, data shape) leaving `display_earnings_cents` null. (**Medium** — needs row-level SQL.)

### SQL — inspect one affected booking

```sql
-- Core identity + selection + assignment
select
  id,
  status,
  payment_completed_at,
  cleaner_id,
  selected_cleaner_id,
  attempted_cleaner_id,
  assignment_type,
  fallback_reason,
  dispatch_status,
  cleaner_response_status,
  is_team_job,
  team_id,
  payout_owner_cleaner_id,
  display_earnings_cents,
  cleaner_earnings_total_cents,
  cleaner_payout_cents,
  payout_frozen_cents,
  total_paid_zar,
  amount_paid_cents,
  price_snapshot is not null as has_price_snapshot,
  jsonb_typeof(booking_snapshot) as snapshot_type
from public.bookings
where id = '<BOOKING_ID>';

-- Line items (earnings basis)
select id, item_type, slug, quantity, unit_price_cents, line_total_cents, cleaner_earnings_cents
from public.booking_line_items
where booking_id = '<BOOKING_ID>'
order by created_at;

-- Dispatch offers
select id, cleaner_id, status, expires_at, created_at, responded_at
from public.dispatch_offers
where booking_id = '<BOOKING_ID>'
order by created_at;

-- Roster
select id, cleaner_id, role, active_from, active_to
from public.booking_cleaners
where booking_id = '<BOOKING_ID>';

-- Pending ledger
select id, cleaner_id, status, amount_cents, created_at
from public.cleaner_earnings
where booking_id = '<BOOKING_ID>';
```

### Why admin could not see selected cleaner

- **Finalize likely nulled `selected_cleaner_id`**, and/or  
- **List UI only surfaces checkout selection via `attempted_cleaner_id`**, which is not set on the `no_pick` path.

### Why earnings were 0

- **Reassignment reset** nulls display and line cleaner cents; **resolver returns `null`** until persist repopulates fields — UI reads as zero.

### Why completion failed

- **`display_earnings_cents` remained `null`** after `persistCleanerPayoutIfUnset`, **or** persist returned **`ok: false`**, triggering the **pre-complete verify** failure. **Not** because earnings were literally `0` cents (that would pass `hasPersistedDisplayEarningsBasis`).

### Minimal safe fix plan (ordered, small deltas)

1. **Finalize:** When finalizing `pending_payment`, if `pickUserSelectedCleanerId` is null, **fall back to existing row’s `selected_cleaner_id`** (from pre-update select) before applying the clear spread — or merge `pickUserSelectedCleanerId` with explicit `existingSelectedCleanerId` from DB. **Avoid** clearing a column the customer path already set unless business rules require it.
2. **Snapshot parity (optional complement):** When persisting lock in flow intake, set **`locked.cleaner_id`** (or metadata `cleaner_id`) to the preferred UUID so Paystack path and DB column agree.
3. **Admin UI:** Show **preferred cleaner** from **`selected_cleaner_id`** (and keep `attempted_cleaner_id` for fallback narrative).
4. **Admin PATCH:** After `resetBookingCleanerLineEarnings` when `newCleaner` is set, **optionally** call **`persistCleanerPayoutIfUnset`** once (same transaction pattern as complete) so mobile never shows a long-lived null display — only if product accepts immediate estimate before job completion.
5. **Ops:** Inspect failing complete response JSON **`code`** / **`error_id`** in logs (`cleaner_lifecycle_complete`, `cleaner/jobs/complete`) for the affected booking.

**Do not:** merge `selected_cleaner_id` into `cleaner_id` without dispatch rules review; bypass `hasPersistedDisplayEarningsBasis`; or treat null display as “0” in the complete guard without fixing persist.

### Test plan (replay scenario)

1. Create pending booking via flow intake **with** `selected_cleaner_id`; ensure lock **without** `cleaner_id`.
2. Finalize with Paystack test reference; assert **`selected_cleaner_id` preserved** (or honor path sets `pending_assignment` + dispatch as designed).
3. Open admin list; assert **visible preferred name/id** from `selected_cleaner_id`.
4. PATCH assign a different cleaner; assert payout columns cleared then **either** immediate persist **or** null until complete.
5. Cleaner accept → en-route → start → complete; assert **200** and `display_earnings_cents` non-null.
6. Regression: user-selected with valid lock `cleaner_id` still honors checkout resolution and dispatch offers.

---

## 7. Commands run and results

| Command | Result |
|---------|--------|
| `npx vitest run lib/booking/userSelectedCleanerFromSnapshot.test.ts lib/cleaner/__tests__/runCleanerBookingLifecycleAction.completionNotifyGate.test.ts lib/payout/__tests__/bookingEarningsIntegrity.test.ts --reporter=dot` | **15 tests passed** (2 files; third path was separate run below). |
| `npx vitest run lib/booking/userSelectedCleanerFromSnapshot.test.ts --reporter=dot` | **3 tests passed**. |
| `npx tsc --noEmit` (cwd `apps/web`) | **Exit code 0**. |
| `npm run lint` | **Not run** — no TS/TSX changes in this audit-only change set. |

---

## Return block (for PR / ticket)

- **Report path:** `docs/audits/selected-cleaner-earnings-completion-failure-audit.md`
- **Files inspected (primary):**  
  `apps/web/lib/booking/insertBookingFlowIntake.ts`,  
  `apps/web/lib/booking/upsertBookingFromPaystack.ts`,  
  `apps/web/lib/booking/userSelectedCleanerFromSnapshot.ts`,  
  `apps/web/lib/booking/checkoutCleanerEligibility.ts`,  
  `apps/web/components/admin/BookingCard.tsx`,  
  `apps/web/app/api/admin/bookings/route.ts`,  
  `apps/web/app/api/admin/bookings/[id]/route.ts`,  
  `apps/web/lib/payout/bookingPayoutColumns.ts`,  
  `apps/web/lib/payout/resetBookingCleanerLineEarnings.ts`,  
  `apps/web/lib/cleaner/resolveCleanerEarnings.ts`,  
  `apps/web/lib/cleaner/runCleanerBookingLifecycleAction.ts`,  
  `apps/web/lib/booking/bookingOperations.ts`,  
  `apps/web/app/api/cleaner/bookings/[id]/complete/route.ts`,  
  `apps/web/lib/payout/bookingEarningsIntegrity.ts`,  
  `apps/web/lib/payout/persistCleanerPayout.ts` (partial).
- **Files changed:** **None** (documentation only).
- **Root cause summary:** Finalize can **clear `selected_cleaner_id`** because picker ignores DB column; admin UI **surfaces the wrong field** for “selected at checkout”; admin reassignment **nulls earnings**; complete **requires non-null `display_earnings_cents`** after persist — **null** blocks completion even when job is `in_progress`.
