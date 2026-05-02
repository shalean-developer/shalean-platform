# PRD: Production launch readiness (payments, SEO, ops)

| Field | Value |
|--------|--------|
| **Status** | Draft |
| **Source** | [`production-launch-7-day-plan.md`](./production-launch-7-day-plan.md) (pre-launch audit) |
| **Owner** | Engineering + Ops (TBD) |
| **Stakeholders** | Product, Support, Marketing/SEO |

---

## 1. Summary

Ship the Shalean web platform to production with **correct Paystack integration**, **reliable booking persistence**, **recoverable failure paths**, **honest customer-facing payment UX**, **indexable marketing SEO**, and **operational visibility**. This PRD defines **what must be true** before and after go-live, mapped to a **7-day execution window**.

---

## 2. Problem statement

Without correct configuration and verification:

- Customer **charges** may not hit the **booking finalize** webhook, over-relying on browser verify and cron.
- **Paid-but-not-persisted** states can confuse customers if UI and emails imply a fully confirmed booking.
- **Transactional URLs** may leak into search indexes; **support** may misuse two different “verify” APIs.
- **Cron and secrets** gaps disable automated recovery from `failed_jobs`.

---

## 3. Goals

1. **Payments**: Every successful customer charge results in a **consistent booking record** (or explicit reconciliation state), with **no duplicate bookings** for the same Paystack reference.
2. **Truthfulness**: Post-payment UI and emails **match system state** (confirmed in DB vs payment received, still finalizing).
3. **Recovery**: Production **cron** processes `failed_jobs` and related paths with authenticated invocations.
4. **SEO**: Marketing pages remain **crawlable and well-formed**; checkout/success URLs are **not indexed** as primary landing pages (target state).
5. **Operations**: Team can **detect, triage, and resolve** payment and finalize failures within agreed SLAs.

---

## 4. Non-goals

- Redesigning the full booking funnel UI (beyond copy/state clarity scoped below).
- Replacing Paystack or migrating payment providers.
- Building a new admin dashboard for `failed_jobs` (unless separately prioritized); visibility via existing DB/logs is sufficient for v1.
- Guaranteeing Core Web Vitals targets in this PRD (measurement and follow-up only).

---

## 5. Users and personas

| Persona | Need |
|---------|------|
| **Customer (guest or logged-in)** | Clear status after Paystack; accurate receipt/confirmation expectations. |
| **Support** | Correct runbooks, distinction between `/api/paystack/verify` and `/api/payments/verify`, access to reference and booking state. |
| **Ops / on-call** | Webhook + cron health; alerts or log queries for finalize failures and `failed_jobs` spikes. |
| **Marketing / SEO** | Indexable homepage, services, locations; sitemap/robots; GSC validation. |

---

## 6. User stories

1. **As a customer**, after I complete Paystack, I want the app to **tell me accurately** whether my booking is saved, so I know whether to wait or contact support.
2. **As a customer**, I want **one booking** for one payment, even if I refresh the success page or the webhook and browser both run.
3. **As ops**, I want **charge webhooks** to hit the endpoint that **finalizes bookings**, so I do not depend on fragile client-only success.
4. **As support**, I want documentation that **prevents confusing** the primary Paystack verify API with the UUID-based payments verify API.
5. **As SEO**, I want **booking success URLs with query parameters** not to become a meaningful indexed surface for the brand.

---

## 7. Functional requirements

### 7.1 Paystack configuration (release gate)

| ID | Requirement | Acceptance criteria |
|----|-------------|---------------------|
| FR-P01 | Customer **charge** webhooks are delivered to the **booking** handler. | Paystack Dashboard shows URL `https://www.shalean.co.za/api/paystack/webhook`; test `charge.success` creates/updates booking as designed. |
| FR-P02 | **Transfer** webhooks (if payouts enabled) use the **transfer** handler. | Dashboard shows `https://www.shalean.co.za/api/webhooks/paystack` for transfer events only; transfer success/failure reflected in payout pipeline. |
| FR-P03 | Server can authenticate to Paystack for initialize and verify. | `PAYSTACK_SECRET_KEY` present in production; successful test initialize + verify in staging or prod test. |

### 7.2 Data and recovery

| ID | Requirement | Acceptance criteria |
|----|-------------|---------------------|
| FR-D01 | Service role can persist bookings after payment. | `SUPABASE_SERVICE_ROLE_KEY` (and related Supabase env) set; finalize path succeeds in test. |
| FR-D02 | Cron can invoke retry endpoint with a shared secret. | `CRON_SECRET` set; `POST /api/cron/retry-failed-jobs` returns success with valid `Authorization: Bearer` header. |
| FR-D03 | Failed finalize / insert paths enqueue work. | After controlled failure in staging, `failed_jobs` row appears and is visible via SQL/admin; cron run processes or escalates per existing logic. |

### 7.3 Customer-facing payment UX

| ID | Requirement | Acceptance criteria |
|----|-------------|---------------------|
| FR-U01 | Full checkout path is verified end-to-end once per release train. | Initialize → Paystack → return URL → success page → verify POST completes without manual DB fix. |
| FR-U02 | UI and email copy align with **persistence state**. | **Shipped:** `persist_pending` phase on `/booking/success` when Paystack succeeded but booking not persisted; “Booking confirmed” only when `bookingId` + `bookingInDatabase`. **Remaining:** inbox QA that processing vs confirmation emails match page copy ([`runbook-payments.md`](./runbook-payments.md) note). |
| FR-U03 | Support documentation names the correct APIs. | **Done:** [`runbook-payments.md`](./runbook-payments.md) — *Verify APIs — do not mix these up*. |

### 7.4 Concurrency and abuse

| ID | Requirement | Acceptance criteria |
|----|-------------|---------------------|
| FR-C01 | Duplicate verify does not create duplicate paid bookings for same reference. | Manual test: second `POST /api/paystack/verify` with same reference → single booking row, idempotent response. |
| FR-C02 | Webhook + browser finalize race produces one consistent outcome. | Manual test: one `paystack_reference`, one terminal booking state. |
| FR-C03 | Abuse surface documented. | Risk accepted for v1 **or** ticket filed: rate limit / WAF for `/api/paystack/initialize`; monitor verify **429** rate. |

### 7.5 SEO and crawlability

| ID | Requirement | Acceptance criteria |
|----|-------------|---------------------|
| FR-S01 | Production serves valid `robots.txt` and `sitemap.xml`. | HTTP 200; sitemap lists intended public URLs. |
| FR-S02 | Key templates render metadata for crawlers. | GSC URL Inspection (or equivalent): `/`, two `/locations/...`, one `/services/...` show title, meta description, one primary H1. |
| FR-S03 | Booking success (minimum) is not intended for organic landing. | **P1 follow-up**: `noindex` on `/booking/success` (and optionally `/booking/*`) implemented **or** explicitly deferred with risk accepted in writing. |
| FR-S04 | Location SEO QA pipeline is trustworthy. | Script/QA for titles/descriptions runs without conflated stderr; sample locations reviewed. |

### 7.6 Security and observability

| ID | Requirement | Acceptance criteria |
|----|-------------|---------------------|
| FR-X01 | Middleware behavior matches policy. | Legacy SEO redirects work; `/cleaner/*` auth rules unchanged; public marketing/booking routes not blocked. |
| FR-X02 | Operational signals exist for payment failures. | Logs or `system_logs` / `reportOperationalIssue` queryable; on-call knows where to look. |
| FR-X03 | (Optional) Webhook HMAC verification uses constant-time compare. | Ticket prioritized **or** implemented for `/api/paystack/webhook` parity with transfer webhook. |

### 7.7 Go-live and performance

| ID | Requirement | Acceptance criteria |
|----|-------------|---------------------|
| FR-G01 | Public app URL matches canonical site. | `NEXT_PUBLIC_APP_URL` aligned with `metadataBase` / production host (www vs apex documented). |
| FR-G02 | Baseline performance captured. | Lighthouse or PageSpeed recorded for `/` + one location page (mobile + desktop); LCP noted for regression baseline. |
| FR-G03 | Rollback and comms assigned. | Named owner for maintenance toggle; support coverage for first 48h post-launch. |

---

## 8. Non-functional requirements

| ID | Category | Requirement |
|----|----------|-------------|
| NFR-01 | Availability | Paystack and Supabase outages handled with user-visible errors (existing behavior) and no silent double-charge for same booking reference. |
| NFR-02 | Security | Webhook secrets never exposed to client; cron endpoint requires secret. |
| NFR-03 | Maintainability | This PRD and [`production-launch-7-day-plan.md`](./production-launch-7-day-plan.md) stay linked; runbook cross-links preserved ([`runbook-payments.md`](./runbook-payments.md)). |

---

## 9. Milestones (7-day plan mapping)

| Milestone | Days (from plan) | Outcome |
|-----------|------------------|---------|
| M1 — Paystack wired | Day 1 | FR-P01–P03 satisfied |
| M2 — Backend recovery | Day 2 | FR-D01–D03 satisfied |
| M3 — Trust UX | Day 3 | FR-U01–U03 satisfied |
| M4 — Concurrency / limits | Day 4 | FR-C01–C03 satisfied or documented |
| M5 — SEO hygiene | Day 5 | FR-S01–S04 satisfied or S03 explicitly deferred |
| M6 — Sec / observability | Day 6 | FR-X01–X02 satisfied; X03 optional |
| M7 — Launch gate | Day 7 | FR-G01–G03 + executive sign-off |

---

## 10. Release criteria (all must be true for “public launch”)

- [ ] **FR-P01** and **FR-P03** verified in production configuration.
- [ ] **FR-D01**, **FR-D02**, and one successful **FR-D03** observation path (staging acceptable for failure injection).
- [ ] **FR-U01** passed; **FR-U02** either implemented or explicitly accepted by product with support briefing.
- [ ] **FR-C01** and **FR-C02** passed in staging or production test.
- [ ] **FR-S01**, **FR-S02** passed on production.
- [ ] **FR-G01** verified; **FR-G03** assigned.

---

## 11. Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Wrong Paystack webhook URL | Bookings not finalized from webhook | M1 checklist; Paystack event log review |
| Cron not running | `failed_jobs` backlog | M2 monitoring; alert on queue depth |
| Misleading success copy | Support load, trust | Mitigated by persist-pending UX; finish FR-U02 with inbox QA |
| Initialize spam | Cost / noise | FR-C03 WAF or rate limit follow-up |
| Indexed success URLs | Thin duplicate URLs in SERPs | FR-S03 noindex |

---

## 12. Open questions

1. Who **owns product copy** for the “paid, persisting” vs “confirmed in system” states (FR-U02)?
2. Is **noindex on entire `/booking`** or **only `/booking/success`** the desired SEO policy (FR-S03)?
3. Are **payout transfer webhooks** in scope for day 1, or only customer charges?

---

## 13. Appendix

- **Execution checklist**: [`production-launch-7-day-plan.md`](./production-launch-7-day-plan.md)
- **Payments runbook**: [`runbook-payments.md`](./runbook-payments.md)
- **Key code references** (for engineering):  
  - `apps/web/app/api/paystack/webhook/route.ts`  
  - `apps/web/app/api/webhooks/paystack/route.ts`  
  - `apps/web/app/api/paystack/verify/route.ts`  
  - `apps/web/app/api/payments/verify/route.ts`  
  - `apps/web/app/booking/success/page.tsx`  
  - `apps/web/app/api/cron/retry-failed-jobs/route.ts`  
  - `apps/web/lib/booking/upsertBookingFromPaystack.ts`  
  - `apps/web/lib/rateLimit/paystackVerifyIpLimit.ts`  
  - `apps/web/app/robots.ts`, `apps/web/app/sitemap.ts`
