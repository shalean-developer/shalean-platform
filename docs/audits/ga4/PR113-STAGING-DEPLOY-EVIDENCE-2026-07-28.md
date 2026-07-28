# PR #113 — Staging deploy evidence (GA4 canonical stream)

**Date:** 2026-07-28  
**PR:** https://github.com/shalean-developer/shalean-platform/pull/113  
**Feature head:** `e64ec952`  
**Staging merge:** `f3d0f784`  
**Production:** **not deployed** (awaiting staging DebugView sign-off + operator approval)

## Guardrails

| Check | Result |
|-------|--------|
| Merged to `staging` only | **PASS** — `f3d0f784` |
| Merged to `main`? | **No** |
| Production deploy? | **No** |
| Vitest (PR CI) | **PASS** |
| PR Vercel Preview | **FAIL** — OOM/SIGKILL during `next build` (infrastructure; not GA4-specific). Staging Preview build **READY**. |

## Staging deployment

| Field | Value |
|-------|-------|
| Status | **READY** |
| Deployment | `dpl_Goy9bNk1qNpQfpXUBrYBWCHs3LJo` |
| Deployment URL | https://shalean-platform-dmz7ij96i-shalean-cleaning-services.vercel.app |
| Staging alias | https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app |
| Target | Preview (not Production) |
| git SHA | `f3d0f784` |

Unauthenticated probes to the staging alias return **HTTP 302** (Vercel Deployment Protection / SSO), consistent with prior staging programs.

## Automated test evidence (pre-merge / local)

```
npx vitest run lib/analytics/__tests__/ga4Config.test.ts \
  lib/analytics/__tests__/ga4Events.test.ts \
  lib/ads/__tests__/sendServerPurchaseConversions.test.ts
→ 19 passed
```

`npm run typecheck` (8192 MB heap) → exit 0.

## Operator follow-up (SSO session)

1. Open staging alias with Vercel SSO.
2. Confirm `GET /api/health/environment` → `shaleanAppEnv=staging`, `gitSha=f3d0f784`.
3. Set staging env if missing:
   - `NEXT_PUBLIC_GA_MEASUREMENT_ID=G-GEVTBDWTQW` (optional; code default)
   - `GA4_MEASUREMENT_PROTOCOL_SECRET` for stream **G-GEVTBDWTQW**
4. Run DebugView matrix: `docs/audits/ga4/GA4-DEBUGVIEW-VERIFICATION-MATRIX.md`
5. Confirm Network: collect `tid=G-GEVTBDWTQW` only; no `G-6JR2GPGPN3`.
6. Confirm `/office`, `/cleaner`, `/jobs` do not initialise GA4.

## Google Admin (outside repo)

- Leave legacy stream `G-6JR2GPGPN3` intact; remove from Google tag / GTM destinations.
- Disable automatic user-provided email collection on the Google tag (`__ogt_1p_data_v2` currently enabled in live tag config).
- Mark `purchase` as primary key event; optional secondaries: `booking_submitted`, `phone_click`, `whatsapp_click`.

## Production approval

**Not requested yet.** Attach completed DebugView checklist to PR #113 before production promote.
