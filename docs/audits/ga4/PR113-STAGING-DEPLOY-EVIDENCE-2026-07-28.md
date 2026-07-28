# PR #113 — Staging evidence (GA4-only, rebuilt from main)

**Date:** 2026-07-28 (scope cleanup)  
**PR:** https://github.com/shalean-developer/shalean-platform/pull/113  
**Base:** `main` (unrelated staging/SEO/finance history removed)  
**Production:** **not deployed**

## Scope

GA4 apex stream + booking funnel + PII scrub + path exclusions only.  
Paystack email / session guards moved to a separate PR.  
Window Cleaning CTAs: unchanged from `main` (informational; `bookCta: false`).

## Codex review corrections

| Thread | Fix |
|--------|-----|
| P1 `window.gtag` queue | Bootstrap assigns `window.gtag` inside IIFE; queue test in `ga4BootstrapQueue.test.ts` |
| P2 Window Cleaning | Restored by rebasing onto `main` (pre-regression); regression tests lock behaviour |
| P2 legacy `ga-disable` | `setGa4Disabled` targets canonical + every `GA4_LEGACY_MEASUREMENT_IDS` entry once |

## Staging

Filled after push / deploy in the agent return block.
