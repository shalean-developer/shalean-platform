# GA4 DebugView verification matrix (staging) — browser analytics infra (PR #113)

Canonical stream: **G-GEVTBDWTQW** (`https://shalean.co.za` apex).  
Do **not** load or send via app bootstrap to legacy **G-6JR2GPGPN3**. Leave that stream in GA Admin; stop sending only.

**Scope of this PR:** browser GA/GTM/Ads loaders, path exclusions, funnel through `begin_checkout`, PII scrub.  
**Out of scope:** durable server Measurement Protocol purchase + client identity stitching (follow-up PR).

Secondary conversions in this PR: `booking_submitted`, `phone_click`, `whatsapp_click`.

## Preconditions

1. Staging deploy includes this branch.
2. Staging env:
   - `NEXT_PUBLIC_GA_MEASUREMENT_ID=G-GEVTBDWTQW` (or unset — code default)
   - `NEXT_PUBLIC_GTM_ID` empty **or** GTM GA4 tag points only at `G-GEVTBDWTQW`
3. Chrome with GA Debugger / Tag Assistant.
4. GA4 Admin → **DebugView** for stream `G-GEVTBDWTQW`.

## Path exclusion matrix

| Step | Action | Expected |
|------|--------|----------|
| E1 | Open staging `/` | One `gtag/js?id=G-GEVTBDWTQW`; **no** `G-6JR2GPGPN3`. |
| E2 | Open `/office` (hard) | No GA/GTM/Ads bootstrap. |
| E3 | Open `/cleaner`, `/jobs` (hard) | Same as E2. |
| E4 | Open `/cleaner/apply` or `/cleaner/apply/form` | GA allowed (public careers). |
| E5 | Soft-nav `/book` → `/office` | `ga-disable` for canonical + legacy; events stop. |
| E6 | Soft-nav `/office` → `/book` (after excluded hard load) | Exactly one GA loader; Ads/GTM bootstrap once. |
| E7 | Soft-nav public → excluded → public | No second `gtag.js` / `gtm.js`; no duplicate `config`. |

## Funnel matrix (through begin_checkout)

| Step | UI action | GA4 event |
|------|-----------|-----------|
| F1 | Land `/book/<service>` step 1 | `booking_start` |
| F2 | Same | `service_selected` |
| F3 | Date + time on step 2 | `schedule_selected` |
| F4 | Step 3 review | `booking_review` |
| F5 | Step 4 payment | `begin_checkout`, `booking_submitted` |

Params: `branch=cape-town`, `service`, `currency=ZAR` (no email/phone/name).

## Window Cleaning

Informational only — no `/book` CTA into unsupported booking-v2 service.

## Purchase (follow-up)

Server MP purchase with durable outbox + browser `client_id` stitching is **not** verified in this PR.
