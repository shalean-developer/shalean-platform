# GA4 DebugView verification matrix (staging)

Canonical stream: **G-GEVTBDWTQW** (`https://shalean.co.za` apex).  
Do **not** send events to legacy **G-6JR2GPGPN3** (www-linked). Leave that stream in GA Admin; stop sending only.

Primary conversion: `purchase`  
Secondary conversions: `booking_submitted`, `phone_click`, `whatsapp_click`

## Preconditions

1. Staging deploy includes this branch.
2. Staging env:
   - `NEXT_PUBLIC_GA_MEASUREMENT_ID=G-GEVTBDWTQW` (or unset — code default)
   - `GA4_MEASUREMENT_PROTOCOL_SECRET=<secret from G-GEVTBDWTQW stream>`
   - `NEXT_PUBLIC_GTM_ID` empty **or** GTM GA4 tag points only at `G-GEVTBDWTQW`
3. Chrome with [Google Analytics Debugger](https://chrome.google.com/webstore) **or** append `?gtm_debug=x` / use Tag Assistant.
4. GA4 Admin → **Admin → DebugView** for property containing stream `G-GEVTBDWTQW`.
5. Enable debug mode: `gtag('config','G-GEVTBDWTQW',{debug_mode:true})` via extension, **or** use the GA DebugView chrome extension.

## Path exclusion matrix

| Step | Action | Expected in DebugView / Network |
|------|--------|----------------------------------|
| E1 | Open staging `/` | `page_view` to `tid=G-GEVTBDWTQW` only. **No** `G-6JR2GPGPN3` collect. |
| E2 | Open `/office` (or `/office/…`) | **No** `gtag/js?id=G-…` load; **no** `g/collect` to GA4. |
| E3 | Open `/cleaner` and `/jobs` | Same as E2. |
| E4 | Soft-nav from `/book` → `/office` | `ga-disable-G-GEVTBDWTQW` set; further events stop. |

## Funnel matrix (happy path)

Use a test suburb on staging; do **not** complete a real card charge unless using Paystack test mode.

| Step | UI action | GA4 event | Required params |
|------|-----------|-----------|-----------------|
| F1 | Land on `/book/<service>` step 1 | `booking_start` | `branch=cape-town`, `service`, `currency=ZAR` |
| F2 | Same step (service locked by URL) | `service_selected` | `service`, `branch` |
| F3 | Pick date + time on step 2 | `schedule_selected` | `service`, `branch` |
| F4 | Reach step 3 (details / review) | `booking_review` | `service`, `branch` |
| F5 | Reach step 4 (payment) | `begin_checkout` | `service`, `branch`, optional `value` |
| F6 | Same | `booking_submitted` (secondary) | `service`, `branch` |
| F7 | Paystack success → `/account/success` after verify | `purchase` (**server MP only**) | `transaction_id`, `value`, `currency=ZAR`, `service`, `branch=cape-town` |

## Purchase once-only matrix

| Step | Action | Expected |
|------|--------|----------|
| P1 | Complete paid booking (test mode) | Exactly **one** `purchase` in DebugView / Realtime with Paystack `transaction_id`. |
| P2 | Refresh `/account/success?reference=…` | **No** second `purchase` (client no longer emits GA4 purchase; server claim blocks MP retry). |
| P3 | Re-hit Paystack callback URL | No second `purchase`. |
| P4 | Re-deliver Paystack `charge.success` webhook | No second `purchase` (`ads_purchase` idempotency claim). |
| P5 | Inspect MP payload / DebugView params | No email, phone, name, street, or notes. |

## Secondary clicks

| Step | Action | Event |
|------|--------|-------|
| S1 | Footer phone click | `phone_click` |
| S2 | Footer / float WhatsApp click | `whatsapp_click` |

## Conversion marking (GA4 Admin — staging then prod)

1. Mark **`purchase`** as key event / primary conversion.
2. Optionally mark `booking_submitted`, `phone_click`, `whatsapp_click` as secondary key events.
3. Register custom dimensions if needed: `service`, `branch` (event-scoped).

## Google Admin follow-ups (not deployable from repo)

1. Confirm stream **website URL** for `G-GEVTBDWTQW` is `https://shalean.co.za`.
2. Leave `G-6JR2GPGPN3` stream intact; remove it from any Google tag / GTM destination so new hits stop.
3. Turn **off** “Automatically collect user-provided data” (email) on the Google tag — live tag config currently has `__ogt_1p_data_v2` with `autoEmailEnabled: true`.
4. Create Measurement Protocol API secret on **`G-GEVTBDWTQW` only**; set `GA4_MEASUREMENT_PROTOCOL_SECRET` on staging (then production after approval).

## Sign-off checklist

- [ ] E1–E4 path exclusion verified on staging
- [ ] F1–F7 funnel verified in DebugView
- [ ] P1–P5 purchase once-only + no PII
- [ ] S1–S2 secondary clicks
- [ ] No collect URLs with `tid=G-6JR2GPGPN3`
- [ ] Production approval requested only after staging evidence attached to PR
