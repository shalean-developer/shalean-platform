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

Record run URL / conclusions after draft PR checks complete.
