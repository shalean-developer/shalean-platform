# Office Dashboard SoT — Deployment Gate Report (2026-07-24)

| Field | Value |
|-------|-------|
| **Branch** | `cursor/office-dashboard-sot-audit-6cab` |
| **Decision** | **STOP — do not complete deployment** |
| **Reason** | Production deploy + live verification cannot be executed from this cloud agent |

---

## Pre-deployment gates

| Gate | Result |
|------|--------|
| Unit tests (dashboard scope) | **PASS** — 44 tests |
| TypeScript (`tsc --noEmit`) | **PASS** (after follow-up type normalize + pagination commit) |
| ESLint (changed files) | **PASS** (0 errors) |
| Merge conflicts vs `main` | **PASS** — clean merge-tree |
| Scope / no migrations | **PASS** — no `supabase/migrations/*`; dashboard-only paths |
| Breaking API changes | **PASS** — additive fields (`finance`, `truncated`, `scanned*`) |
| GitHub checks on PR | **BLOCKED** — cannot create PR (integration 403; repo permissions all false) |
| Production DB audit script | **BLOCKED** — no `apps/web/.env.local` / service role |
| Vercel deploy | **BLOCKED** — no Vercel credentials (`vercel whoami` → login required) |

---

## Acceptance criteria status

| Criterion | Status |
|-----------|--------|
| Every widget matches production data | **NOT VERIFIED** (no prod DB) |
| Visit-day vs payment-day clearly distinguished | **CODE READY** (not deployed) |
| No misleading financial labels | **CODE READY** (not deployed) |
| Cross-module reconcile from SoT | **NOT VERIFIED** |
| No stale cache / truncated queries | **CODE READY** (ops + schedule now paged; safety ceilings 50k / 10k remain) |
| Refresh updates all widgets | **CODE READY** (not deployed) |
| No Office regressions | **NOT VERIFIED** (no prod smoke) |

---

## What is ready on the branch

1. Visit-day finance + payment-day labelling  
2. Receivables exposure (not “cash position”)  
3. Assignment alignment (preferred ≠ assigned)  
4. Active cleaner workforce filter  
5. Refresh reloads schedule + ops + stats  
6. **Paged** ops-snapshot + schedule/day (no `.limit(3500)` / `.limit(800)`)  
7. `npm run audit:office-dashboard` (exits 1 without credentials)

---

## Exact blockers to unblock deployment

1. **Open/merge PR** for `cursor/office-dashboard-sot-audit-6cab` → `main` (or promote via your normal release path). This agent cannot create PRs or push to `main` (GitHub app permissions: pull/push/admin all false).  
2. **Provide production secrets** to the agent environment, *or* run locally:

```bash
cd apps/web
# with production service role in .env.local
AUDIT_DATE=$(date +%F) npm run audit:office-dashboard
AUDIT_DATE=2026-07-24 npm run audit:office-dashboard
```

3. **Confirm Vercel production** has deployed the merge commit, then compare `/office` widget values to script output.

---

## Required human / privileged next steps

1. Create PR from branch (GitHub UI if API blocked).  
2. Wait for `web-test` CI green.  
3. Merge to `main` → wait for production deploy.  
4. Run audit script against production.  
5. Paste script output + `/office` screenshot into this report to close acceptance.

**Until steps 1–5 complete, deployment must not be marked successful.**

---

## Follow-up (same day): CI unblock

`web-test` failed on required `npm run audit:production` due to PostCSS GHSA-r28c-9q8g-f849.
Repo already pinned `overrides.postcss` to `8.5.12` (vulnerable). Bumped override to **`8.5.23`** (patched) — no Next downgrade.

Local `npm run audit:production` → **found 0 vulnerabilities**.

