# GA4 DebugView verification matrix (staging) — browser analytics infra (PR #113)

Canonical stream: **G-GEVTBDWTQW** (`https://shalean.co.za` apex).  
Do **not** load legacy **G-6JR2GPGPN3** via app bootstrap.

**Scope:** browser GA/GTM/Ads loaders, path exclusions, funnel through `begin_checkout`, `booking_submitted` after confirm, PII scrub.  
**Out of scope:** durable server Measurement Protocol purchase (follow-up PR).

## Path exclusion

| Step | Action | Expected |
|------|--------|----------|
| E1 | Open `/` | One `gtag/js?id=G-GEVTBDWTQW`; no legacy ID |
| E2 | Open `/office`, private `/cleaner/*`, `/jobs` | No GA/GTM/Ads |
| E3 | Open `/cleaner/apply` or `/cleaner/apply/form` | GA allowed |
| E4 | Soft `/book` → `/office` | `ga-disable` for canonical + legacy |
| E5 | Soft `/office` → `/book` (excluded hard load) | One loader; funnel events fire |
| E6 | Soft public → excluded → public | No duplicate gtag.js / gtm.js / config |

## Funnel

| Event | When |
|-------|------|
| `booking_start` / `service_selected` | Step 1 |
| `schedule_selected` | Date+time |
| `booking_review` | Step 3 |
| `begin_checkout` | Step 4 entry |
| `booking_submitted` | **Only** after `/api/booking-v2/confirm` succeeds (once per booking id) |

Params: `branch=cape-town`, `service`, `currency=ZAR` — no email/phone/name.
