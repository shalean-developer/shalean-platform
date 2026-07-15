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

**Screenshots:** Not captured in this agent run (no staging browser session for visual before/after). Retest should capture Farai screenshots on staging preview after merge/deploy of this PR.

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
