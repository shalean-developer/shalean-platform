# Farai UAT Batch 2 — Customer Remediation

| Field | Value |
|-------|-------|
| **Ticket** | FARAI-UAT Phase 2 Batch 2 |
| **Date** | 2026-07-15 |
| **Branch** | `fix/uat-batch2-farai-customer-remediation` |
| **Base** | `staging` (post PR #11) |
| **Production** | Unchanged — no deploy / promote / migration |

---

## Defects addressed

| ID | Remediation |
|----|-------------|
| UAT-BRAND-001 | Dedicated on-dark SVG footer wordmark + cache bump |
| UAT-CONTACT-001 | Journey-based contact page + form, hours, response times, FAQ |
| UAT-UX-003 | What's Included floating modal / mobile bottom sheet |
| UAT-BOOK-009 / UAT-BOOK-012 | Unsupported suburb floating modal; Areas CTA → `/areas-we-serve` |
| UAT-NAV-007 | New `/areas-we-serve` page (region-grouped, clickable suburbs) |
| UAT-BOOK-010 / UAT-PRICE-003 | Per-service extras allowlists + staging `pricing_extras` seed + static fallback; duration policies for new extras; bedrooms may be 0 |
| UAT-BOOK-ENH-001 | Bedroom 0–6+ / bathroom 1–6+ chips with exact-count popup |
| UAT-BOOK-008 / UAT-BOOK-011 | Independent review edit panels (location, equipment, property, schedule, cleaner, extras) |
| UAT-AUTH-003 | Contact phone prefill from `/api/customer/profile` then auth metadata |
| UAT-DASH-003 | Full booking lifecycle timeline |
| UAT-INVOICE-001 | Guard PDF/View when Zoho invoice missing; meaningful status |

---

## Staging data note

`pricing_extras` on **staging** was empty (root cause of missing add-ons). Seeded 28 active extras via SQL on staging only — **not** a schema migration; production untouched.

---

## Verification

| Check | Result |
|-------|--------|
| `npm run test:critical` | PASS (34) |
| `npm run typecheck` | PASS |
| `npm run lint:booking-core` | PASS |
| `npm test` (Vitest full) | 517/519 files pass; 1 pre-existing fail in `bookingQuoteLifecyclePhase8` (reproduced on clean staging); eligibility drift updated for new extras |
| `next build --webpack` | See `evidence-batch2-next-build.txt` |

Evidence logs: `docs/audits/uat/farai/evidence-batch2-*.txt`

**Screenshots:** Before pack from Batch 1 remains under `evidence/`. After-fix screenshots to be captured on staging after this PR deploys (Farai retest).
