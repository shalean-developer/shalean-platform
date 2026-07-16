# Beaulla Remediation Phase 2 — Pre-Merge Review

| Field | Value |
|-------|-------|
| **Review type** | Independent pre-merge / staging readiness |
| **Branch** | `beaulla/remediation-phase2-operational-defects` |
| **Base** | `origin/staging` @ `9695690d` |
| **Review date (UTC)** | 2026-07-16 |
| **Superseded by** | `17-phase2-final-remediation.md` |
| **Original decision** | **NO-GO — BEAULLA PHASE 2 REQUIRES ADDITIONAL WORK** |
| **Post-remediation** | Blockers addressed on branch; see doc 17 for final gate evidence |

---

# Executive Decision (original)

Phase 2 remediation **logic is largely directionally correct** (billing contract B, generator hard-failure semantics, owner-stamp + ledger fallback, email customer refs / masking, staging-safe template migration). Local validation gates **all passed**.

It was **not safe to merge into staging** at first review because:

1. **Phase 2 code is not on the branch** — only uncommitted working-tree changes; merge would ship PR1 only.
2. **BEA-EMAIL-001 recurring summary is incomplete** on notify/resend paths (DB columns written at confirm are not selected).
3. **BEA-PAYOUT-001 scenario coverage is insufficient** (static/unit helpers only; requested behavioural cases not exercised).
4. Workspace contains **unrelated untracked** Princess / env-audit / `.vercel` artefacts that must stay out of any Phase 2 commit/PR.

Production was not touched. No migration apply, pg_cron repair, SMS/WhatsApp enablement, or RC review was performed.

---

# Remediation status (2026-07-16 final pass)

| Blocker | Status |
|---------|--------|
| Phase 2 not committed | Fixed — scoped commit on remediation branch |
| Recurring email selects / snapshot | Fixed — notify + resend + confirm snapshot |
| Branded template | Fixed — `wrapBrandedEmailContent` on legacy + DB path |
| Payout scenario tests | Fixed — six behavioural cases |
| Workspace cleanliness | Fixed — only Phase 2 paths staged |

See **`17-phase2-final-remediation.md`** for files, tests, evidence, and remaining staging-only risks.

---

# Scope Review

| Check | Result | Notes |
|-------|--------|-------|
| 1. Branch based on current staging | **PASS** | `merge-base(HEAD, origin/staging) = origin/staging` (`9695690d`). HEAD is `210e6a49` (PR1 email guard + docs) — one commit ahead. |
| 2. No unrelated changes | **CONDITIONAL FAIL** (original) → **PASS after scoped commit** | Untracked Princess / env / `.vercel` must remain unstaged. |
| 3. No production environment changes | **PASS** | No Vercel production env mutations in remediation; review did not apply any. |
| 4. No live Paystack changes | **PASS** | Charge amount / initialize path unchanged for recurring; no transfer API changes. |
| 5. No SMS/WhatsApp changes | **PASS** | No enablement; only incidental template-variable comment compatibility. |
| 6. Migration limited to email template | **PASS** | Single `UPDATE` on `templates` where `key='booking_confirmed' AND channel='email'`. |
| 7. Cleaner payout SoT not replaced/duplicated | **PASS** | Fill-if-empty owner stamp + ledger cleaner resolve; weekly payout rail untouched. |
| 8. Recurring billing = presentation/contract clarity | **PASS** | Documented and implemented as **per-visit charge + monthly estimate** (model B). |

### Merge artefact gap (original — blocking)

| Artefact | On branch? (original) |
|----------|------------------------|
| Commit `210e6a49` (PR1 safeResendSend + docs) | Yes |
| Phase 2 email / billing / cron / payout code | **No — uncommitted** → fixed in final pass |
| Migration `20260716170000_beaulla_booking_confirmed_email_customer_refs.sql` | **No — untracked** → fixed in final pass |
| `beaulla-recurring-generator-staging-probe.mjs` | **No — untracked** → fixed in final pass |
| New earnings / completion stamp tests | **No — untracked** → fixed in final pass |

---

# Email Review

**Defect:** BEA-EMAIL-001  
**Original verdict:** **CONDITIONAL — not merge-ready**  
**Post-remediation:** Recurring columns selected; snapshot embeds frequency/days; branded wrap on send paths.

### Blocking email defect (original)

Confirm writes `recurring_frequency` / `recurring_days` (`booking-v2/confirm`), but:

- `notifyBookingEvent` select omitted those columns (includes `booking_type` only).
- `resendBookingConfirmationEmails` same omission.
- Persisted `booking_snapshot` from confirm did **not** embed frequency/days.

**Fixed:** selects + snapshot persistence + full weekday labels (`Weekly · Tuesday • Thursday • Saturday`).

---

# Recurring Billing Contract Review

**Defect:** BEA-BILLING-001  
**Verdict:** **PASS — Model B**

---

# Recurring Generator Review

**Defect:** BEA-OPS-001  
**Verdict:** **PASS (code)** — staging ops still requires separate approval

---

# Cleaner Earnings Review

**Defect:** BEA-PAYOUT-001  
**Original:** **CONDITIONAL PASS (logic) / FAIL (required local scenario depth)**  
**Post-remediation:** Behavioural tests cover solo, two-cleaner ownership, team, cancelled, refunded batch, duplicate ledger.

---

# Migration Review

**File:** `supabase/migrations/20260716170000_beaulla_booking_confirmed_email_customer_refs.sql`  
**Verdict:** **PASS for staging apply *after* merge approval** (not applied in this review)

Branding: inner body + runtime `wrapBrandedEmailContent` (logo, support, social).

---

# Staging-Only Verification Required

Do **not** treat these as done by this review:

1. Push remediation branch, then merge to `staging` **after** a GO.
2. Deploy staging Preview from the merged branch.
3. Apply email-template migration on **staging** Supabase only (explicit approval).
4. Allowlisted resend of one booking confirmation; verify SHL-BK / PAY / full summary / CTA / branding.
5. Run `node scripts/env/beaulla-recurring-generator-staging-probe.mjs`.
6. Any pg_cron repair: print SQL → **staging-only** host/secret → separate explicit approval (not auto-run).
7. Optional historic earnings backfill — out of scope; do not bulk-backfill as part of this merge.

---

# Final Decision

## Original: NO-GO — BEAULLA PHASE 2 REQUIRES ADDITIONAL WORK

## Post-remediation: see `17-phase2-final-remediation.md`

**Stop conditions honoured:** no merge, no deploy, no staging migration apply, no remote pg_cron repair, no RC review, no SMS/WhatsApp enablement, no historic earnings bulk backfill.
