# MKT-001F — Marketing UX Polish

**Project:** Shalean Cleaning Services  
**Phase:** MKT-001F — Marketing UX Polish  
**Date:** 2026-07-17  
**Branch:** `feature/mkt-001f-marketing-ux-polish`  
**Base:** `staging` (`3d062ef7`)  
**Type:** Admin UX / accessibility / responsiveness (no architecture change)  
**Production:** **NO-GO** until MKT-001A-PROD closes

---

## Governance

| Constraint | Status |
|---|---|
| Base on verified `staging` | Respected |
| Target `staging` only; do not merge to `main` | Respected |
| Do not deploy to production | Respected |
| MKT-001A-PROD remains sole production blocker | Respected |
| Preserve MKT-001A–E and MKT-001B.2 Slice 1 controls | Respected |
| No real Instagram / LinkedIn / X / Pinterest adapters | Respected |
| No publish/queue/encryption/idempotency/intelligence rule changes unless UX defect | Respected — UI wiring + helpers only |
| Avoid DB migrations | Respected — none introduced |

---

## 1. Executive summary

MKT-001F audits and hardens marketing administration UX across Connected Accounts, Social Posts / Campaign Builder, and Platform Intelligence without changing publishing, provider, queue, security, or intelligence engines.

| Score | Value |
|---|---|
| **UX readiness** | **84 / 100** |
| **Accessibility readiness** | **80 / 100** |
| **Mobile readiness** | **82 / 100** |
| **Staging merge readiness** | **GO** |
| **Production readiness** | **NO-GO** (MKT-001A-PROD) |

**Decision:** **CONDITIONAL GO** for staging merge after PR review and exact-SHA staging verification. Production remains **NO-GO**.

---

## 2. Route and component inventory

### Admin routes (`/office/marketing/*`)

| Route | Primary workflow | Component |
|---|---|---|
| `/office/marketing` | Marketing ROI / spend | Marketing page |
| `/office/marketing/campaigns` | Create → configure → generate → monitor | `CampaignMarketingHub` |
| `/office/marketing/social` | Compose → validate → publish / copy | `CampaignMarketingHub` (`social`) |
| `/office/marketing/connected-accounts` | Connect / reconnect / history | `ConnectedAccountsPanel` |
| `/office/marketing/intelligence` | Health → alerts → DLQ replay | `PlatformIntelligencePanel` |
| `/office/marketing/email` | Review email drafts | Hub (`email`) |
| `/office/marketing/landing-pages` | Review landing copy | Hub (`landing`) |
| `/office/marketing/analytics` | Campaign KPIs | Hub (`analytics`) |
| `/office/marketing/templates` | Launch templates | Hub (`templates`) |
| `/office/marketing/assets` | Creatives / QR | Hub (`assets`) |

### Shared UX additions (this phase)

| Module | Role |
|---|---|
| `lib/promotions/marketingUx.ts` | Provider state classification, safe %, publish guards, empty-state catalog, hub nav |
| `MarketingEmptyState.tsx` | Actionable empty / load-failure states + section skeletons |
| `MarketingSubNav.tsx` | Cohesive cross-surface navigation (includes Accounts + Intelligence) |

---

## 3. UX findings (prioritized)

### Critical (fixed)

| ID | Finding | Fix |
|---|---|---|
| C1 | Wide tables used `overflow-hidden` without horizontal scroll on campaigns, intelligence, and publish history | `overflow-x-auto` + `min-w-*` tables |
| C2 | Social Posts ignored `/api/admin/promotions/providers` registry snapshot | Hub loads registry; publish gates require diagnostics **and** `registryAllowsPublish` |

### High (fixed)

| ID | Finding | Fix |
|---|---|---|
| H1 | Hub sub-nav omitted Connected Accounts + Intelligence | Shared `MarketingSubNav` on hub, accounts, intelligence |
| H2 | Fragmented failure recovery from Connected Accounts | Banner links Social Posts **and** Intelligence DLQ; clearer empty/history states |
| H3 | No MKT-001F UX unit coverage | `mkt001fMarketingUx.test.ts` (11 tests) |
| H4 | Icon-only campaign actions lacked accessible names | `aria-label` on edit/generate/preview/pause/resume/duplicate/end/delete/landing |
| H5 | Provider cards implied availability without clear lifecycle | `classifyProviderUxState` + capability ribbons (available / configured / connected / disabled / unsupported / expired / degraded) |
| H6 | Empty states were generic (“No publishes yet”) | Catalogued empty states with why + next action |
| H7 | Unsaved campaign edits could be discarded silently | `beforeunload` + on-page dirty warning for create/edit |

### Medium (fixed where low-risk)

| ID | Finding | Fix |
|---|---|---|
| M1 | Intelligence window toggles lacked `aria-pressed` | Added |
| M2 | Provider filter was free-text only | Select of known registry keys |
| M3 | Zero-sample rates could read as 0% in UI helpers | `formatSafePercent` / `formatSafeRoi` |
| M4 | Templates / assets / analytics empty grids | `MarketingEmptyState` |
| M5 | Facebook env-only connect asymmetry | Expanded operator guidance on Connected Accounts |

### Low (deferred)

| ID | Finding | Notes |
|---|---|---|
| L1 | `CampaignMarketingHub` remains a large monolith | Split deferred; out of safe polish scope |
| L2 | Mixed native `<select>` vs shadcn controls | Cosmetic consistency only |
| L3 | Legacy `/office/promotions` alias | Leave for compatibility |
| L4 | Full WCAG audit automation / axe CI | Manual AA alignment improved; automated a11y CI deferred |
| L5 | Deep-link retry to a specific failed content row | Needs product design; history still routes to Social / Intelligence |

---

## 4. Accessibility findings

| Finding | Severity | Status |
|---|---|---|
| Icon-only campaign actions without names | High | Fixed |
| Time-range toggles without `aria-pressed` | Medium | Fixed |
| Trend chart color-only | Medium | Fixed text equivalent (`sr-only` list + `role="img"`) |
| Caption over-limit not announced | Medium | `role="alert"` + `aria-describedby` |
| Severity badges color-only | Medium | Explicit severity text + `aria-label` |
| Focus trapping in dialogs | Low | No new modal system; deferred |
| Reduced motion | Medium | Skeletons use `motion-reduce:animate-none` |

---

## 5. Mobile findings

| Finding | Severity | Status |
|---|---|---|
| Campaign / SLI / DLQ / history tables overflow | Critical | Fixed via horizontal scroll |
| Long correlation IDs / provider names | High | `break-words` / `break-all` |
| Touch targets on nav pills / replay | Medium | `min-h-8` / `min-h-9` |
| Sticky office chrome covering content | Low | No regression observed in structure; operator verify post-deploy |
| Card stacking | Pass | Existing grids already stack; retained |

**Breakpoints audited in implementation review:** 320 / 375 / 390 / 430 / 768 / 1024 / 1440 (code-level; visual staging evidence after deploy).

---

## 6. Before / after workflows

### Connected Accounts

**Before:** Status badges mixed “coming soon” with publish-ready language; history empty copy was generic; no Intelligence link for failures.  
**After:** Explicit UX states; capability ribbons; actionable empties; failure banner → Social + Intelligence DLQ; shared marketing nav.

### Social Posts

**Before:** Publish enabled from diagnostics only; duplicate clicks gated only by busy UI; empty copy was one line.  
**After:** Registry + diagnostics gate; `canInvokePublish` early-return; caption limit alerts; richer empty state with path to Campaigns.

### Campaign Builder

**Before:** No unsaved warning; icon actions untitled for AT; load errors without retry.  
**After:** Dirty-form warning; labeled actions; skeleton loading; retry on list error; templates/assets empties.

### Intelligence

**Before:** Free-text provider; tables clipped; empty alerts were one green line; trends lacked text equivalent.  
**After:** Provider select; scrollable tables; catalog empties; chart a11y text; safe % display; replay `aria-label`.

---

## 7. Implemented improvements

1. Shared `marketingUx` helpers (provider lifecycle, publish guard, safe metrics, empty catalog).
2. `MarketingEmptyState` + `MarketingSectionSkeleton`.
3. `MarketingSubNav` across hub / accounts / intelligence.
4. Connected Accounts state clarity, Facebook guidance, history empties, responsive history table.
5. Hub: registry wiring, dirty protection, a11y labels, responsive tables, empty/loading/error recovery.
6. Intelligence: filters a11y, provider select, empties, responsive tables, trend text equivalent.
7. Focused unit tests for MKT-001F behaviors.

**Not changed:** publish job semantics, encryption, idempotency, provider adapters, intelligence rule thresholds, DB schema.

---

## 8. Deferred issues

See Low findings L1–L5. Additionally deferred:

- Automated visual regression matrix at every breakpoint
- Screen-reader end-to-end recording (operator staging smoke)
- Campaign wizard step indicator redesign (current tabbed hub preserved)

---

## 9. Test evidence

| Suite | Result |
|---|---|
| `mkt001fMarketingUx.test.ts` | **PASS** (11) |
| MKT-001D completion | **PASS** (6) |
| MKT-001C registry | **PASS** (13) |
| MKT-001E intelligence | **PASS** (16) |
| MKT-001B.2 jobs + hub compatibility | **PASS** (14) |
| `tsc --noEmit` (`apps/web`) | **PASS** |
| ESLint on touched marketing files | **PASS** |
| `npm run test:critical` | **PASS** (134) |
| MKT-001C `publishingService` mocks (B.2 enqueue path) | **PASS** (5) — updated for queue-backed `runPublish` |
| Production build (local) | **ENV GAP** — local `apps/web` build lacks workspace `@shalean/*` package resolution; rely on Vercel staging build |
| DB migrations | **N/A** (none) |

---

## 10. Staging verification matrix (post-merge)

Complete in `MKT-001F-staging-verification.md` after exact-SHA deploy:

| Scenario | Expected |
|---|---|
| No connected accounts | Helpful empty + connect path |
| Healthy provider | Connected + publish ready |
| Disabled / stub provider | Unavailable; no publish |
| Expired / degraded | Reconnect guidance |
| Social success / failure | Toast + history / correlation |
| Duplicate publish click | One logical publish |
| Campaign draft dirty | Unsaved warning |
| Empty analytics | Em-dash, not fake 0% |
| Intelligence alert | Severity, evidence, action, runbook |
| Mobile nav / tables | No clipped primary actions |
| Keyboard | Operable nav + publish controls |
| Secrets | No tokens / raw payloads |

---

## 11. Decision

| Gate | Result |
|---|---|
| Critical / High UX defects addressed | **PASS** |
| Architecture controls intact | **PASS** |
| Staging merge authorized after review | **GO** |
| Production release | **NO-GO** |

**Authorized outcome:** merge to `staging` only; verify exact SHA; do not begin `main` or production release activity.
