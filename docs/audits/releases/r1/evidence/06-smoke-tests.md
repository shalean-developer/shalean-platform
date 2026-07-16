# Production Smoke-Test Results

All checks against production apex https://shalean.co.za (serving deployment dpl_6RZTr3exZiLJYXs6QoPbJBVnUCzw)
unless noted. No charges, no bulk messaging, no mutating cron executed.

## PUBLIC (all HTTP 200)
- / , /services , /book (pricing) , /about , /faq , /contact , /quote , /reviews , /refer
- /services/standard-cleaning-cape-town , /services/deep-cleaning-cape-town
- Staging banner: ABSENT (no staging/test marker in homepage HTML)
- No Paystack secret/test key present in public homepage HTML

## AUTH / GATING
- /login -> 200 (loads); /signup -> 307 -> /auth/signup (loads)
- Unauthenticated protected areas redirect to login (307):
  - /account       -> /login?redirect=%2Faccount   (customer)
  - /office        -> /login?redirect=%2Foffice     (admin)
  - /jobs          -> /login?redirect=%2Fjobs       (cleaner)
- Full authenticated login flows were NOT executed (no throwaway prod credentials provisioned;
  avoids modifying production data). Gating + login routes verified instead.
- password-reset route: /api/auth/forgot-password present (POST route; safe, not invoked).

## ADMIN
- /office gated to login (307). Admin APIs unauthenticated => 401:
  /api/admin/me, /api/admin/bookings, /api/admin/cleaners, /api/admin/customers (all 401)
- /api/admin/email/health -> 401 (gated)

## CUSTOMER
- /account and children gated to login (307).
- /api/account/rewards -> 401 (gated). /api/bookings/me -> 410 (intentionally deprecated; no data leak).

## CLEANER
- /jobs gated to login (307). /api/cleaner/apply -> 405 (POST-only; route exists, GET blocked).
- Admin/finance routes remain blocked to unauthenticated callers (401), as above.

## BOOKING (non-charging, read-only)
- /api/booking-v2/services -> 200 (service catalog loads: regular/standard/deep/etc.)
- /api/booking/service-locations -> 200 (production service areas; e.g. Cape Town suburbs)
- Quote calculation (POST /api/booking/quote, serviceType=standard, 2 bed / 1 bath, once_off, 10:00):
  -> 200 { pricingVersion: 7, total: 329, hours: 4.5 }
  -> duration diagnostics: canonical_duration_minutes 270 (= 4.5h), delta_severity "parity"
- Availability: /api/booking/time-slots?serviceType=standard&date=2026-07-24 -> 200;
  /api/booking-v2/team-availability -> 400 without params (reachable, validates)
- Stopped before any real payment.

## PAYMENTS
- Paystack live identity confirmed (env: secretMode/publicMode = live; prefixes sk_live_/pk_live_).
- No test key in production. No test key leaked in public HTML.
- Payment init routes safe/method-gated: /api/booking/checkout -> 405 (GET), 
  /api/bookings/payment-precheck -> 405 (GET). No real charge performed.

## EMAIL
- Production outbound messaging enabled (env messaging.outboundDisabled=false); Resend is provider
  (notification provider allowlist includes 'resend').
- /api/admin/email/health present and gated (401). No bulk messages sent; no controlled test send performed.

## CRON
- Production CRON_SECRET configured & enforced: cron routes reject missing auth (401):
  /api/cron/ops-health, /api/cron/booking-reminders, /api/cron/charge-recurring-bookings -> 401.
  Invalid bearer also rejected. /api/cron/notification-health -> 405 (method-gated).
- Scheduler registration: 45 cron routes present under /api/cron/* (health visibility via
  /api/cron/ops-health and /api/cron/notification-health, and /api/admin/cron-health).
- No mutating cron manually executed.
