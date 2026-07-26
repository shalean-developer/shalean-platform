# PR #112 — Staging-only promotion report

**Date:** 2026-07-26  
**PR:** https://github.com/shalean-developer/shalean-platform/pull/112  
**Approved head:** `998b70ba7b246509a5978128d185943ebda45ea0`  
**Verdict:** **PASS — staging only**

## Guardrails

| Check | Result |
|-------|--------|
| PR head unchanged at approval | **PASS** — `998b70ba7b246509a5978128d185943ebda45ea0` |
| Merged to `staging` only | **PASS** — merge SHA `7b7c47cd6871b42648f54412e4a78af33911c242` |
| Merged to `main`? | **No** — `origin/main` remains `abab7b1fe9c4e2186405a489aa2610f6ab80216a` |
| Production deploy? | **No** |
| Payout redistribution? | **No** — PR commits are finance display/rollup only |
| Invent earnings for SHL-BK-000527? | **No** |

## Merge

| Field | Value |
|-------|-------|
| Method | Local merge commit into `staging` (not `gh pr merge` → main) |
| Conflict resolution | `apps/web/package.json` / lockfile — kept PR/main overrides (`postcss` 8.5.23 + `googleapis-common`) |
| Staging merge SHA | `7b7c47cd6871b42648f54412e4a78af33911c242` |
| Contains approved head | Yes (`git merge-base --is-ancestor 998b70ba origin/staging`) |

## Staging deployment

| Field | Value |
|-------|-------|
| Status | **READY** |
| Deployment | `dpl_A8DE9M1Ki84yMiV1tQtyoEYafAGD` |
| Deployment URL | https://shalean-platform-bxajmeqdf-shalean-cleaning-services.vercel.app |
| Staging alias | https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app |
| Target | Preview (not Production) |
| Health `gitSha` | `7b7c47cd6871b42648f54412e4a78af33911c242` |
| Health `gitBranch` / `shaleanAppEnv` | `staging` / `staging` |
| Paystack | test keys |

Health probe (`/api/health/environment`): `status=ok`, `issues=[]`.

## Acceptance evidence

### Automated (deployed logic)

`npx vitest run` on staging HEAD for:

- `bookingProfitabilityCleanerCost.test.ts` (19)
- `bookingExpensesProfitDisplay.test.ts` (2)

**Result: 21/21 pass**, covering:

| Case | Evidence |
|------|----------|
| Five-person team R1,270 not R250 | Regression test |
| Incomplete team earnings warning | Unit + display helpers |
| Cleaner / net / margin show "—" | `bookingExpensesProfitDisplay` regression (`null/100` ≠ R0) |
| Incomplete excluded from trusted revenue+cost | `trustedBookingRollupContribution` |
| Operational incomplete revenue separate | `untrusted_incomplete_team` payload + rollup contribution still exposes revenue when excluded |
| Solo uses `display_earnings_cents` | Unit |
| Trusted totals stable across pages | Pagination regression |
| Expenses / gateway / platform unchanged on incomplete | Incomplete row keeps fee cents; only cleaner/net/margin null |

### Live office UI

`/office/booking-profitability` on staging alias redirects to **Sign in — Shalean \| STAGING** (admin auth required). Interactive office verification not completed in this session.

### Staging DB read-only

`vercel env pull` for staging preview wrote redacted `[SENSITIVE]` placeholders for Supabase URL/key in this agent environment, so live SHL-BK-000527 / team-sample DB queries could not be executed here.  
SHL-BK-000527 remains documented as incomplete-team (no authoritative `team_job_member_payouts`); no earnings were invented.

### Payout records

PR #112 commit range (`54857b2d..998b70ba`) does not modify payout writers or redistribute `team_job_member_payouts`. Merge performed no DB writes.

## Residual follow-ups (non-blocking for staging promote)

1. Finance-admin login smoke on staging alias for profitability UI + financial dashboard untrusted banner.
2. If SHL-BK-000527 must be visually confirmed, run against the environment that holds that booking (likely production DB) in read-only mode — still do not invent totals.

## NO-GO items (honored)

- No production merge
- No production deployment
- No payout redistribution
- No manual invention of earnings for SHL-BK-000527
