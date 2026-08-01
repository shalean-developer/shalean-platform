# GA4 Measurement ID inventory (PR #113 — browser infra)

| ID | Role | App behaviour |
|----|------|----------------|
| **G-GEVTBDWTQW** | Canonical apex stream (`https://shalean.co.za`) | Sole Measurement ID loaded by `GoogleAnalytics` / `getGa4MeasurementId()` |
| **G-6JR2GPGPN3** | Legacy / www-linked | Never loaded; listed in `GA4_LEGACY_MEASUREMENT_IDS` and disabled via `ga-disable-*` on internal routes |

Do **not** delete the legacy stream in GA Admin — only stop sending.

## Path policy

Excluded (no public GA/GTM/Ads init): `/office`, `/cleaner`, `/jobs` (+ subpaths).
Carve-out (still tracked): `/cleaner/apply`, `/cleaner/apply/form`.

## Follow-up (not this PR)

Durable Measurement Protocol `purchase`, browser `client_id`/`session_id` stitching, and payment-session identity are deferred to a separate PR with an outbox/worker design.
