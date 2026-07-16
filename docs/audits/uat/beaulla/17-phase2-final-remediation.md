# Beaulla Phase 2 — Final Remediation

| Field | Value |
|-------|-------|
| **Review type** | Final implementation pass (pre-staging) |
| **Branch** | `beaulla/remediation-phase2-operational-defects` |
| **Date (UTC)** | 2026-07-16 |
| **Decision** | Ready for staging merge review (no merge/deploy performed) |

---

## Root cause

Pre-merge review (`16-phase2-premerge-review.md`) found Phase 2 logic largely correct but **not mergeable**:

1. Phase 2 code lived only in the working tree (not committed).
2. `notifyBookingEvent` / `resendBookingConfirmationEmails` omitted `recurring_frequency` / `recurring_days`, so confirmation emails lost the recurring summary.
3. DB template body lacked parity with the branded shell path; legacy HTML still used text “Shalean.” header.
4. Payout ownership/ledger coverage was helper-only — the six required behavioural cases were missing.

---

## Files changed

### BEA-EMAIL-001
| File | Change |
|------|--------|
| `lib/notifications/notifyBookingEvent.ts` | Select `recurring_frequency`, `recurring_days` |
| `lib/notifications/resendBookingConfirmationEmails.ts` | Same |
| `app/api/booking-v2/confirm/route.ts` | Persist `recurringFrequency` / `recurringDays` on `booking_snapshot` |
| `lib/email/resolveBookingEmailFields.ts` | Full weekday labels + `•` day join |
| `lib/email/sendBookingEmail.ts` | Legacy path uses `wrapBrandedEmailContent` (logo/header/footer) |
| `lib/templates/bookingConfirmedData.ts` | Customer refs + recurring row |
| `lib/templates/templateDefaults.ts` | New field defaults / raw HTML keys |
| `lib/email/bookingEmailPayload.ts` | Extended payload |
| `lib/booking/customerBookingReference.ts` | Masked `PAY-` display |
| `lib/customer/customerAccountPaths.ts` | Booking detail URL |
| `supabase/migrations/20260716170000_beaulla_booking_confirmed_email_customer_refs.sql` | Branded-shell-compatible DB template |

### BEA-BILLING-001
| File | Change |
|------|--------|
| `lib/recurring/estimateMonthlyRevenue.ts` | Shared visit/month + monthly estimate helpers |
| Booking V2 summary / review / payment steps | Model B labels (pay today this visit) |
| Account recurring list | Per-visit + estimated monthly |

### BEA-OPS-001
| File | Change |
|------|--------|
| `lib/recurring/recurringGeneratorRunSummary.ts` | Hard failure = insert failures only |
| `app/api/cron/generate-recurring-bookings/route.ts` | Align cron success/error semantics |
| `scripts/env/beaulla-recurring-generator-staging-probe.mjs` | Staging probe (print/opt-in) |

### BEA-PAYOUT-001
| File | Change |
|------|--------|
| `lib/payout/ensureCleanerEarningsLedger.ts` | Owner fallback + `buildSoloCompletionOwnerStamp` |
| `lib/cleaner/runCleanerBookingLifecycleAction.ts` | Solo completion owner stamp |
| `app/api/cron/booking-lifecycle/route.ts` | Same stamp on auto-complete |

---

## Tests added

| Test | Covers |
|------|--------|
| `lib/payout/__tests__/ensureCleanerEarningsLedger.test.ts` | Solo, two-cleaner ownership, team skip, cancelled, refunded batch, duplicate ledger |
| `lib/cleaner/__tests__/runCleanerBookingLifecycleAction.completionOwnerStamp.test.ts` | Stamp helper wired in lifecycle + cron |
| `lib/notifications/__tests__/beaullaEmailRecurringSelect.test.ts` | Select + snapshot persistence guards |
| `lib/email/__tests__/resolveBookingEmailFields.test.ts` | `Weekly · Tuesday • Thursday • Saturday` |
| `lib/templates/__tests__/bookingConfirmedData.test.ts` | Recurring row + masked refs |

---

## Evidence

Local gates re-run after remediation (see `docs/audits/uat/beaulla/evidence/beaulla-phase2-final-*`):

| Gate | Result |
|------|--------|
| Targeted Phase 2 tests | **PASS** (53) |
| `test:critical` | **PASS** (134) |
| Full Vitest | **PASS** (3375 / 533 files) |
| `typecheck` | **PASS** |
| `lint:booking-core` | **PASS** |
| `db:migrations:validate` | **PASS** (12 active migrations) |
| `next build --webpack` | **PASS** (blog CMS fetch warnings expected) |

---

## Before / after

| Area | Before | After |
|------|--------|-------|
| Branch tip | PR1 only; Phase 2 uncommitted | Phase 2 committed on remediation branch |
| Recurring email | Columns written, not selected → summary missing | Select + snapshot → `Weekly · Tuesday • Thursday • Saturday` |
| Template branding | Legacy text header / DB body without logo | `wrapBrandedEmailContent` (logo, colours, CTA, footer) on DB + legacy paths |
| Payout tests | Resolver unit only | Six behavioural scenarios + stamp contract |
| Workspace commit | Risk of Princess/env/.vercel pollution | Only Phase 2 paths staged |

---

## Remaining risks

- Staging Preview deploy + allowlisted resend still required for live email screenshot UAT.
- Email template migration must be applied on **staging** only after merge approval (not applied here).
- Historic completed bookings with null cleaner still need optional backfill (out of scope).
- `print-repair-generate-recurring-pg-cron.sql.mjs` remains print-only; remote pg_cron repair needs explicit staging approval.
- Production / RC / SMS-WhatsApp enablement intentionally untouched.

---

## Stop conditions honoured

No merge to main/staging. No production deploy. No remote migration apply. No RC start.
