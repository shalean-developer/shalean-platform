# CI — Production dependency audit remediation

| Field | Value |
|-------|-------|
| **Date** | 2026-07-20 |
| **Branch** | `fix/ci-production-dependency-audit` |
| **Base** | `main` |
| **Scope** | Dependency resolution / lockfile / CI restoration only |
| **Out of scope** | Payout logic, PR #76 merge, production deploy, migrations, transfers |

## Root cause

`apps/web` CI step `Production dependency audit (high+)` runs:

```bash
npm audit --omit=dev --audit-level=high
```

Failing high finding:

| Package | Severity | Advisory | Path |
|---------|----------|----------|------|
| `brace-expansion` 2.1.1 | high | [GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp) | `googleapis` → `rimraf` → `glob` → `minimatch` → `brace-expansion` |

Moderate `postcss` (via `next`) remains; **below** `--audit-level=high`, so it does not fail CI. Forcing a postcss fix would downgrade Next (rejected).

## Fix

1. Bump nested production `brace-expansion` **2.1.1 → 2.1.2** in `package-lock.json`.
2. Add durable npm override:

```json
"overrides": {
  "brace-expansion@2": "2.1.2"
}
```

No application source changes.

## Local verification

| Check | Result |
|-------|--------|
| `npm run audit:production` | **PASS** (exit 0; only moderate postcss remains) |
| `npm run test:critical` | **PASS** — 17 files / 134 tests |
| `npm run typecheck` | **PASS** (exit 0) |

## GitHub CI

| Check | Result | URL |
|-------|--------|-----|
| `web-test` / vitest | **SUCCESS** (5m13s) | https://github.com/shalean-developer/shalean-platform/actions/runs/29781856938 |
| Production dependency audit (high+) | **PASS** (step within vitest) | same run |
| migration-governance | **PASS** | https://github.com/shalean-developer/shalean-platform/actions/runs/29781856969 |
| Vercel preview | **PASS** | https://vercel.com/shalean-cleaning-services/shalean-platform/AB59KSESDGLDegeHvyzH1ENNEoi4 |
| GitGuardian | **PASS** | dashboard |

**Draft PR:** https://github.com/shalean-developer/shalean-platform/pull/77  
**Commit:** `213f3b0d`

### Decision

Dependency-audit CI restoration is **complete**. Moderate `postcss` (Next nested) remains by design. Ready for human review / merge authorization (separate from PAYOUT-E2E-001 PR #76).
