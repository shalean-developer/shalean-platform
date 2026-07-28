# GA4 production audit — Measurement ID inventory

**Date:** 2026-07-28  
**Canonical stream:** `G-GEVTBDWTQW` → website URL `https://shalean.co.za`  
**Stop sending (do not delete):** `G-6JR2GPGPN3` (legacy Google tag / www-linked)

## Inventory

| ID | Source | Action |
|----|--------|--------|
| `G-GEVTBDWTQW` | Live `g/collect?tid=` on apex; `__ccd_ga_first` destination in gtag config | **Keep — sole public + MP Measurement ID** |
| `G-6JR2GPGPN3` | Former hardcoded default in `GoogleAnalytics.tsx` / MP fallback; gtag/js loader ID | **Stop loading / ignore if set in env** |
| `GTM-5XRFHPL8` | `.env.example` only (optional `NEXT_PUBLIC_GTM_ID`) | Keep optional; GA4 tag inside GTM must target `G-GEVTBDWTQW` only |
| `AW-11050850519` | Google Ads (not GA4) | Unchanged |

## Code touchpoints (after this change)

- `apps/web/lib/analytics/ga4Config.ts` — canonical ID, path exclusions
- `apps/web/components/analytics/GoogleAnalytics.tsx` — loads canonical ID; path skip
- `apps/web/lib/ads/sendServerPurchaseConversions.ts` — MP purchase once
- `apps/web/lib/analytics/ga4Events.ts` — funnel + secondary events
- `apps/web/.env.example` — docs

## Related

- [DebugView verification matrix](./GA4-DEBUGVIEW-VERIFICATION-MATRIX.md)
