# Production launch — 7-day plan

Action plan derived from the pre-launch audit (payments, SEO, ops). Treat each day as a focused slice; adjust ordering if you already completed an item.

---

## Day 1 — Paystack and webhooks (hard prerequisites)

- [ ] In **Paystack Dashboard → Webhooks**, set the **customer charge** URL to:  
  `https://www.shalean.co.za/api/paystack/webhook`  
  (Handler: `apps/web/app/api/paystack/webhook/route.ts` — `charge.success`, `charge.failed`, monthly invoice path.)
- [ ] Confirm **payout / transfer** events (if used) point to:  
  `https://www.shalean.co.za/api/webhooks/paystack`  
  (`apps/web/app/api/webhooks/paystack/route.ts` — `transfer.success` / `transfer.failed` only.)
- [ ] Record a **test payment** in production (or staging with live keys only if policy allows): verify one row in `bookings` and expected `paystack_reference`.
- [ ] Verify **`PAYSTACK_SECRET_KEY`** is set in the production deployment (initialize + verify + webhooks all depend on it).

---

## Day 2 — Supabase, service role, and cron recovery

- [ ] Confirm **`SUPABASE_SERVICE_ROLE_KEY`** (and URL/anon) in production — admin client required for finalize (`getSupabaseAdmin()`).
- [ ] Confirm **`CRON_SECRET`** is set and **only** known to your scheduler (Vercel Cron / Supabase `pg_net`, etc.).
- [ ] Prove **`POST /api/cron/retry-failed-jobs`** runs in production with `Authorization: Bearer <CRON_SECRET>` (see `apps/web/app/api/cron/retry-failed-jobs/route.ts`).
- [ ] In Supabase (or admin UI), confirm **`failed_jobs`** exists and you can query recent rows after a deliberate test failure in staging.

---

## Day 3 — Payment UX and truthfulness (customer trust)

- [ ] Walk **full checkout** (manual QA): `/api/paystack/initialize` → Paystack → return → **`/booking/success`** → `POST /api/paystack/verify` (`apps/web/app/booking/success/page.tsx`).
- [x] **Persist-pending UX** — When Paystack succeeds but `bookingId` / DB persist is not ready: dedicated screen, honest copy, analytics only `payment_completed` with `persist_pending`; **“Booking confirmed”** only after `bookingId` + `bookingInDatabase` (see `apps/web/app/booking/success/page.tsx`).
- [x] **Inbox QA (recommended)** — Open real sends: **`sendCustomerBookingPaymentProcessingEmail`** (“We’re finalising your booking”) vs post-save confirmation; confirm tone matches persist-pending vs confirmed success copy.
- [x] **Support doc** — Two verify endpoints documented in [`runbook-payments.md`](./runbook-payments.md) § *Verify APIs — do not mix these up*.

---

## Day 4 — Concurrency, idempotency, and abuse surface

- [x] **Idempotency test**: after a successful payment, call **`POST /api/paystack/verify`** again with the same reference; expect **no duplicate booking** (see `upsertBookingFromPaystack` in `apps/web/lib/booking/upsertBookingFromPaystack.ts`).
- [x] **Webhook + client overlap**: complete payment, ensure webhook fires and success page loads; DB should show **one** finalized booking.
- [x] Review **`/api/paystack/initialize`** for abuse: no strong IP rate limit in code — consider WAF / edge limits or a follow-up task if traffic spikes.
- [x] Note **in-memory verify rate limit** (`apps/web/lib/rateLimit/paystackVerifyIpLimit.ts`): per-instance, shared bucket for `verify:unknown` — acceptable for v1 but monitor **429** rates after launch.

---

## Day 5 — SEO and crawl hygiene *(current focus)*

- [ ] Fetch **`/robots.txt`** and **`/sitemap.xml`** on production (`apps/web/app/robots.ts`, `apps/web/app/sitemap.ts`).
- [ ] **Google Search Console**: URL Inspection for `/`, two **`/locations/...`** URLs, one **`/services/...`** page; confirm rendered HTML has title, meta description, and a single clear **H1**.
- [ ] Add or schedule work: **`robots: noindex`** (or equivalent) for **`/booking/success`** (and optionally wider `/booking` funnel) to avoid indexing Paystack **`?reference=`** URLs — not yet in `apps/web/app/booking/layout.tsx`.
- [ ] Re-run location SEO QA cleanly (fix **`apps/web/scripts/seo-err.txt`** noise / title-length checks if you rely on that script).

---

## Day 6 — Security, middleware, and observability

- [ ] Confirm **proxy** only redirects legacy SEO URLs and refreshes Supabase session; **cleaner** routes still require auth as intended (`apps/web/proxy.ts`, `apps/web/lib/supabase/supabaseMiddleware.ts`).
- [ ] Spot-check **no accidental 403** on public routes (marketing, booking entry, location pages).
- [ ] Ensure **`system_logs` / `reportOperationalIssue`** and Paystack **`logSystemEvent`** paths are monitored (Datadog, Vercel logs, or daily ops summary — `apps/web/lib/ops/dailyOpsSummary.ts`).
- [ ] Optional hardening: **timing-safe** HMAC compare on **`/api/paystack/webhook`** (parity with `apps/web/app/api/webhooks/paystack/route.ts`).

---

## Day 7 — Go-live checklist and performance

- [ ] **`NEXT_PUBLIC_APP_URL`**: matches live canonical (www vs apex) so email links and redirects match `getPublicAppUrlBase()` / `metadataBase` (`https://www.shalean.co.za`).
- [ ] **Lighthouse / PageSpeed** (mobile + desktop) on `/` and one location page; note **LCP** and font loading (Geist from `next/font` in root layout).
- [ ] **Email path**: one booking end-to-end with inbox check (payment confirmed, assignment if applicable).
- [ ] **Rollback / comms**: who toggles maintenance, who answers Paystack + support if `failed_jobs` spikes in the first 48 hours.
- [ ] Sign-off: **Paystack webhook URL**, **cron + secrets**, **one full prod payment**, **GSC fetch** — minimum bar for “live”.

---

## Reference — audit verdict summary

| Area                         | Status (at audit time)                                      |
|-----------------------------|-------------------------------------------------------------|
| Paystack webhook URL        | Critical to get **`/api/paystack/webhook`** for charges     |
| Persistence + retry         | Solid design (`failed_jobs`, cron); requires prod config    |
| Success page vs DB lag      | **Mitigated (Day 3):** persist-pending UX + inbox QA; optional: record full checkout walk above |
| Core SEO (home, locations)  | Solid baseline; transactional URLs need `noindex` follow-up |

Related internal doc: [`runbook-payments.md`](./runbook-payments.md).
