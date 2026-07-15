# Phase 2 — Customer UAT Remediation (Batch 1 / Farai)

| Field | Value |
|-------|-------|
| **Ticket** | FARAI-UAT Phase 2 Batch 1 |
| **Date** | 2026-07-15 |
| **Branch** | `fix/uat-phase2-customer-remediation` |
| **Base** | `staging` (includes PR #10 booking blockers) |
| **Production** | Unchanged — no deploy / promote / DB mutation |
| **Google Defect Register** | Not present in repo or Downloads; inventory taken from Farai UAT reconciliation (`01-farai-uat-defect-reconciliation.md`) + Phase 2 brief module list + codebase verification |

---

# Executive Summary

Controlled customer-facing remediation across branding, public navigation, booking UX, pricing transparency (display-only), payments messaging, auth, dashboard clarity, rebook prefill, and referrals accessibility.

**Finance, payment finalize, and booking confirm engines were not rewritten.** Paystack remains the card processor; Shalean confirmation messaging was clarified around checkout and success.

Custom recurrence (`UAT-BOOK-UX-008`) remains **backlog design only** — not shipped.

---

# Defect Mapping

| ID / Module | Defect | Remediation | Status |
|-------------|--------|-------------|--------|
| UAT-BRAND-001 | Footer logo CSS invert / poor on navy | `ShaleanNavLogo` `variant="onDark"`; footer uses variant | Done |
| Logo governance | Dashboard Sparkles placeholder | Account sidebar uses `ShaleanNavLogo` | Done |
| UAT-BRAND-002 | About emerald vs marketing blue | About + FAQ retokened to `blue-*` | Done |
| Header avatar | Alignment on navy top bar | Flex center + border on dark | Done |
| 3P branding (UI) | Paystack “powered by” over-exposed | Softened to Shalean confirmation framing | Done |
| Email branding | App templates already Shalean shell | Verified; Auth emails still dashboard-configured | Partial (ops) |
| UAT-NAV-001 | Pricing → `/book` | Nav → `/cleaning-prices-cape-town` | Done |
| UAT-NAV-002 | Help ≡ FAQ duplicate | Nav label **FAQ**; footer deduped to Help & FAQs | Done |
| UAT-NAV-003 | Quote + Book both `/book` | Pricing CTA Instant Quote → `/quote` | Done |
| UAT-NAV-004 | Areas chips not clickable | Links to `/locations/{slug}` | Done |
| UAT-NAV-005 / UX-002 | `#included` miss on hub | `id="included"` + `scroll-mt-28` on hub & SEO pages | Done |
| UAT-BOOK-UX-003 | Standard included in booking | Step 1 disclosure for regular cleaning | Done |
| UAT-NAV-006 / footer | Window/Laundry soft targets | Window → window page; Laundry → Airbnb | Done |
| UAT-BOOK-UX-001 | Unsupported area recovery | Call / WhatsApp / Areas CTAs | Done |
| UAT-BOOK-UX-004–007 | Move Qs + conditionals | Simplified Move-in/out; `showWhen` for move-out-only | Done |
| Module 4 Pricing | Recurring transparency | Per-visit + est. monthly copy (no fee math change) | Done |
| Module 5 Payments | Checkout messaging | Shalean confirmation after Paystack copy | Done |
| Module 6 Auth | Phone / password / confirm | Required phone; 8-char guidance; Shalean email tip | Done |
| Module 7 Dashboard | Pending / timeline | Split badges; Cleaner assigned step; clearer copy | Done |
| Module 8 Rebook | Incomplete clone | Equipment + preferred cleaner from snapshot/row | Done |
| Module 9 Referrals | Copy Link contrast | Text/icon colour + outline button default text | Done |
| UAT-BOOK-UX-008 | Custom recurrence | Backlog only (`04-…`) | Deferred |
| UAT-LEGAL-001/002 | Privacy/Terms completeness | Needs business/legal approval | Outstanding |
| Modules 11–13 | Full UX / responsive / WCAG audit | Spot fixes via contrast/nav/a11y labels; not a full formal audit | Partial |

---

# Files Changed (application)

Primary surfaces (non-exhaustive):

- Branding: `ShaleanNavLogo.tsx`, `FooterSection.tsx`, `AccountNav.tsx`, About/*, FAQ/*
- Nav: `marketingHomeHeaderNav.ts`, `GlobalTopNav.tsx`, `marketingServiceNavLinks.ts`, `MarketingAreasSection.tsx`, `CleaningPricesCapeTownPage.tsx`, `services/page.tsx`, `SeoCapeTownServicePage.tsx`
- Booking: `serviceConfig.ts`, `Step1Details.tsx`, `PropertyAddressSection.tsx`, `BookingV2SummaryPanel.tsx`, `Step4Payment.tsx`, `schemas.ts`, `bookingV2CatalogTypes.ts`
- Rebook: `rebookFromBookingRow.ts` + tests
- Auth: `app/auth/signup/page.tsx`
- Dashboard: `booking-card.tsx`, `customer-booking-status-badge.tsx`, `account/bookings/[id]/page.tsx`
- Referrals: `ReferralLandingView.tsx`, `button.tsx` outline text colour

---

# Evidence

| Artifact | Path |
|----------|------|
| Critical tests | `docs/audits/uat/farai/evidence-phase2-test-critical.txt` |
| Full Vitest | `docs/audits/uat/farai/evidence-phase2-vitest-full.txt` |
| Typecheck | `docs/audits/uat/farai/evidence-phase2-typecheck.txt` |
| Migration validate | `docs/audits/uat/farai/evidence-phase2-migration-validate.txt` |
| Next build (webpack) | `docs/audits/uat/farai/evidence-phase2-next-build.txt` |
| Lint (touched core files) | Clean on scoped eslint of key remediation files; broad tree still has pre-existing `react-hooks/set-state-in-effect` warnings unrelated to this batch |

**Screenshots:** Post-merge after-fix pack captured under `docs/audits/uat/farai/evidence/` (see Screenshot Evidence Index below).

**Before / After (representative):**

| Area | Before | After |
|------|--------|-------|
| Nav Pricing | Linked to `/book` | Dedicated pricing page |
| Footer logo | Ad-hoc CSS invert | `variant="onDark"` |
| Move questions | Always showed furnished/inspection; “Both” option | Move-out-only gated; Move-in / Move-out only |
| Rebook | Cleared cleaner + equipment | Prefills equipment + preferred cleaner IDs |
| Pending badge | Generic “Pending” | Awaiting payment / cleaner / billed monthly |

---

# Regression Testing

| Check | Result |
|-------|--------|
| `npm run test:critical` | PASS (34) |
| `npm test` (Vitest full) | PASS (517 files / 3169 tests) |
| `npm run typecheck` | PASS |
| `npm run db:migrations:validate` | PASS |
| `npx next build --webpack` | PASS |
| Scoped eslint on key files | PASS |

---

# Outstanding Items

1. **Google spreadsheet** still not in repo — if Farai logged additional IDs not in reconciliation, reconcile on retest.
2. **Supabase Auth email templates** (confirm/reset) — configure in Supabase Dashboard for staging (logo/from-name); not in application repo.
3. **UAT-LEGAL-001/002** Privacy/Terms content — business/legal.
4. **UAT-BOOK-UX-008** Custom recurrence — design backlog only.
5. **Formal WCAG / multi-device matrix** — recommend Princess technical UAT pass.
6. **Visual screenshot pack** — capture on staging after this PR deploys to staging preview.

---

# Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Nav Pricing destination change | Low | Book Now CTA remains `/book` |
| Required phone on signup | Low | Aligns with booking Step 1 phone requirement |
| Move “both” removed | Low | Customers book two cleans separately if needed |
| Rebook preferred cleaner | Medium | Availability still recalculated; unavailable cleaner won’t lock schedule |
| Display-only pricing copy | Low | No fee engine change |

---

# Retest Instructions (Farai)

1. Open staging preview for this branch (after merge to `staging` — **do not use production**).
2. **Branding:** Footer logo readable on navy; About/FAQ blue (not emerald); account sidebar wordmark.
3. **Nav:** Pricing → prices page; FAQ label; Areas chips open location hubs; `/services#included` scrolls to included.
4. **Booking:** Unsupported suburb shows recovery CTAs; Move-in hides furnished/inspection; Move-out shows them; Standard Step 1 includes “What’s included”.
5. **Recurring:** Summary shows price per visit + estimated monthly helper.
6. **Pay:** Step 4 mentions Paystack then Shalean confirmation.
7. **Auth:** Signup requires phone; password ≥8 guidance; confirmation copy says Shalean.
8. **Dashboard:** No vague “Pending” for payment vs cleaner; timeline shows Cleaner assigned.
9. **Rebook:** Prior address/rooms/extras/equipment/preferred cleaner prefilled; pick new date; pay creates new booking.
10. **Referrals:** Copy Link readable contrast.

---

# Final Decision (pre-staging-deploy)

**CONDITIONAL GO for Farai Retest** after this PR is merged to `staging` and the staging preview is READY.

Until then: **NO-GO for formal retest on production or stale staging without this package.**

Do **not** merge to `main`. Do **not** promote production.

---

# PR #11 Merge Evidence

| Field | Value |
|-------|-------|
| **Ticket** | FARAI-UAT-REM-03 |
| **Date** | 2026-07-15 |
| **PR** | https://github.com/shalean-developer/shalean-platform/pull/11 |
| **Approved head SHA** | `d2464a7608ab12b80a27b4d1dcc231d11c219b5e` |
| **Target branch** | `staging` only |
| **Merge method** | **Merge commit** (`gh pr merge --merge`) |
| **Merge commit SHA** | `51af2a49bc13c74305f8bf5524c089b01cbeb1c7` |
| **Merged at (UTC)** | `2026-07-15T11:31:00Z` |
| **Operator** | Cursor agent (via Farai `gh` credentials) |
| **Merged into `main`?** | **No** |

### Pre-merge checks (immediately before merge)

| Check | Result |
|-------|--------|
| 1. Targets `staging` | **PASS** |
| 2. Head SHA still `d2464a76…` | **PASS** |
| 3. No new unreviewed commits | **PASS** — single commit on PR |
| 4. Mergeable | **PASS** — `MERGEABLE` / `CLEAN` |
| 5. Required checks green | **PASS** — vitest, migration-governance, Vercel, GitGuardian |
| 6. Reviewed scope unchanged | **PASS** |
| 7. No production activity in progress | **PASS** — latest production deploy remains ENV-03 / PR #9 |

---

# Staging Deployment

| Field | Value |
|-------|-------|
| Deployment ID | `dpl_47A571kuDRsfq7vhDfPR9HvukBRv` |
| Branch | `staging` |
| Commit | `51af2a49bc13c74305f8bf5524c089b01cbeb1c7` |
| Ready state | **READY** |
| Vercel `target` | `null` (preview — **not** production) |
| Branch alias | `https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app` |
| Customer domain assigned? | **No** |
| Production promoted? | **No** |

Inspector: https://vercel.com/shalean-cleaning-services/shalean-platform/47A571kuDRsfq7vhDfPR9HvukBRv

---

# Environment Verification

`GET /api/health/environment` on staging alias (`2026-07-15T11:36:08Z`):

| Field | Observed | Expected |
|-------|----------|----------|
| `status` | `ok` | ok |
| `shaleanAppEnv` | `staging` | staging |
| `gitBranch` | `staging` | staging |
| `vercelEnv` | `preview` | preview |
| Supabase ref | `gbgnemlpyykyhpqqbgru` | `gbgnemlpyykyhpqqbgru` |
| Paystack secret/public | **test** / **test** | test |
| Outbound messaging | `outboundDisabled: true` | suppressed |
| Issues | `[]` | empty |
| Secrets exposed? | **No** — prefixes only (`sk_test_…` / `pk_test_…`) | no secrets |

Identity mismatch stop condition: **not triggered**.

Production remains on `dpl_ZHmN235f…` / `7b49b3ad` (PR #9 ENV-03) — **not** PR #11.

---

# Staging Smoke Result

Staging URL: `https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app`

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 1 | Homepage + global nav | **PASS** | Staging banner; Services / Pricing / About / FAQ / Contact |
| 2 | Footer logo onDark | **PASS** | White/light wordmark on navy footer |
| 3 | Pricing nav destination | **PASS** | Nav → `/cleaning-prices-cape-town` (SEO proxy lands pricing education blog; **not** `/book`) |
| 4 | Help/FAQ labels + destinations | **PASS** | Header **FAQ** → `/faq`; footer **Help & FAQs** |
| 5 | Areas We Serve clickable | **PASS** | e.g. `/locations/sea-point-cleaning-services` loads hub |
| 6 | Services `#included` | **PASS** | `id="included"` in view; “What's included” |
| 7 | About/FAQ blue hierarchy | **PASS** | About: 0 emerald / 64 blue-* classes; FAQ blue accents |
| 8 | Booking Step 1 valid suburb | **PASS** | Claremont resolves; sidebar shows Claremont |
| 9 | Move-in / Move-out options | **PASS** | Only Move-in + Move-out (no Both) |
| 10 | Conditional move questions | **PASS** | Move-out shows furnished/inspection; Move-in hides them |
| 11 | Recurring pricing transparency | **PASS** | “Price per visit” + “Estimated monthly spend” + per-visit future copy |
| 12 | Signup requires phone | **PASS** | Phone required field |
| 13 | Password 8-character guidance | **PASS** | Placeholder + helper both state 8 characters |
| 14 | Dashboard pending separation | **PASS*** | Auth-gated UI; deployed labels `Awaiting payment` / `Awaiting cleaner` / `Cleaner assigned` / billed monthly |
| 15 | Cleaner assignment understandable | **PASS** | Schedule: Best available + UAT cleaner list |
| 16 | Rebook prefill | **PASS*** | Auth-gated UI; `rebookFromBookingRow` shipped in PR #11 with tests |
| 17 | Referrals Copy Link contrast | **PASS** | `/refer` Copy Link dark text on light outline (`text-zinc-900` / `text-slate-900`) |
| 18 | Paystack test mode | **PASS** | Health: test/test |
| 19 | No unrestricted customer message | **PASS** | `outboundDisabled: true`; smoke sent no outbound |
| 20 | Production unchanged | **PASS** | No merge to main; prod deploy still PR #9 |

\*Auth-gated customer dashboard/rebook screens require Farai sign-in for visual confirmation; remediation code is on the READY staging deploy.

**Overall smoke:** **PASS** (environment ready; Farai completes signed-in dashboard/rebook visuals during retest).

---

# Screenshot Evidence Index

Stored under `docs/audits/uat/farai/evidence/`:

| File | Defect / area |
|------|----------------|
| `UAT-BRAND-001-footer-logo-staging-2026-07-15-after.png` | Footer onDark logo |
| `UAT-NAV-001-pricing-nav-staging-2026-07-15-after.png` | Pricing nav destination |
| `UAT-NAV-002-faq-nav-staging-2026-07-15-after.png` | FAQ nav |
| `UAT-NAV-004-areas-links-staging-2026-07-15-after.png` | Areas We Serve hub |
| `UAT-NAV-005-whats-included-staging-2026-07-15-after.png` | Services `#included` |
| `UAT-BRAND-002-about-blue-staging-2026-07-15-after.png` | About blue branding |
| `UAT-BOOK-UX-suburb-step1-staging-2026-07-15-after.png` | Step 1 suburb |
| `UAT-BOOK-UX-004-move-out-questions-staging-2026-07-15-after.png` | Move-out conditionals |
| `UAT-PRICING-recurring-per-visit-staging-2026-07-15-after.png` | Recurring per-visit / monthly |
| `UAT-AUTH-phone-password-staging-2026-07-15-after.png` | Signup phone + 8-char password |
| `UAT-REFERRALS-copy-link-staging-2026-07-15-after.png` | Referrals Copy Link |

No customer PII or secrets captured.

---

# Remaining Deferred Items

| ID | Status | Notes |
|----|--------|-------|
| UAT-BOOK-UX-008 Custom recurrence | **DEFERRED** | Design backlog only (`04-custom-recurrence-design-backlog.md`) |
| UAT-LEGAL-001/002 Privacy/Terms | **DEFERRED** | Business/legal content approval |
| Supabase Auth email templates | **DEFERRED** | Staging dashboard ops (logo/from-name) |
| Formal WCAG / multi-device matrix | **DEFERRED** | Recommend Princess technical UAT later |
| Google Defect Register spreadsheet | **Outstanding** | Not in repo; reconcile if Farai has extra IDs |

Do **not** mark deferred items as fixed.

---

# Farai Retest Instructions

**Base URL (staging only):**  
`https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app`

Do **not** use production. Do **not** begin Princess or Beaulla scenarios.

### Defect-by-defect retest list (PR #11 scope)

| Defect / module | Expected after PR #11 | Retest mark |
|-----------------|----------------------|-------------|
| UAT-BRAND-001 Footer logo | Readable white/light logo on navy footer | PASS / FAIL / PARTIAL |
| Logo governance (account sidebar) | `ShaleanNavLogo` wordmark (not Sparkles) | PASS / FAIL / PARTIAL |
| UAT-BRAND-002 About/FAQ colours | Blue hierarchy (not emerald) | PASS / FAIL / PARTIAL |
| Header avatar on navy | Aligned / bordered | PASS / FAIL / PARTIAL |
| UAT-NAV-001 Pricing | Goes to pricing path (not Instant Book `/book`) | PASS / FAIL / PARTIAL |
| UAT-NAV-002 Help/FAQ | Header **FAQ**; footer Help & FAQs (no duplicate Help≡FAQ) | PASS / FAIL / PARTIAL |
| UAT-NAV-003 Quote vs Book | Instant Quote → `/quote`; Book Now → `/book` | PASS / FAIL / PARTIAL |
| UAT-NAV-004 Areas chips | Open `/locations/{slug}` hubs | PASS / FAIL / PARTIAL |
| UAT-NAV-005 / UX-002 `#included` | `/services#included` scrolls to What's included | PASS / FAIL / PARTIAL |
| UAT-BOOK-UX-003 Standard included | Step 1 “What's included” disclosure | PASS / FAIL / PARTIAL |
| UAT-BOOK-UX-001 Unsupported area | Recovery CTAs when suburb unsupported | PASS / FAIL / PARTIAL |
| UAT-BOOK-UX-004–007 Move Qs | Move-in/out only; conditionals move-out-only | PASS / FAIL / PARTIAL |
| Module 4 Recurring pricing | Per-visit + estimated monthly helper | PASS / FAIL / PARTIAL |
| Module 5 Payments messaging | Paystack then Shalean confirmation framing | PASS / FAIL / PARTIAL |
| Module 6 Auth | Required phone; 8-char password guidance | PASS / FAIL / PARTIAL |
| Module 7 Dashboard | Split pending badges; Cleaner assigned timeline | PASS / FAIL / PARTIAL |
| Module 8 Rebook | Prefills address/rooms/extras/equipment/preferred cleaner | PASS / FAIL / PARTIAL |
| Module 9 Referrals | Copy Link readable contrast | PASS / FAIL / PARTIAL |
| UAT-BOOK-UX-008 Custom recurrence | **DEFERRED** — do not expect shipped | **DEFERRED** |
| UAT-LEGAL-001/002 | **DEFERRED** — legal content | **DEFERRED** |

### Suggested path

1. Open staging homepage → confirm staging banner.  
2. Walk nav: Pricing, FAQ, Areas chip, `/services#included`, About.  
3. Booking Regular → Claremont → Schedule → Recurring Weekly → confirm per-visit + monthly copy.  
4. Moving Cleaning → Move-out vs Move-in question gating.  
5. Signup form (phone + password guidance).  
6. Sign in → dashboard status clarity + rebook prefill + referrals Copy Link.  
7. Confirm Paystack remains **test**; send no live customer messages.

---

# Final Retest Readiness Decision

**PASS — STAGING READY FOR FARAI RETEST**

| Gate | Status |
|------|--------|
| PR #11 merged to `staging` | Done (`51af2a49…`) |
| Staging deploy READY | Done (`dpl_47A571ku…`) |
| Staging identity correct | Done |
| Focused smoke tests | Pass |
| Production unchanged | Confirmed |
| Screenshot evidence | Captured under `evidence/` |
| Deferred items remain open | Confirmed |
| Retest instructions complete | Confirmed |

Farai may begin customer UAT retest of **PR #11 defects only** on the staging preview above.

Do **not** merge to `main`. Do **not** promote production. Do **not** start Princess or Beaulla UAT.
