# Marketing Provider Release Manifest

**Program:** Marketing Platform  
**Purpose:** Version-controlled audit trail of which providers are active in each production release.  
**Authority:** Must be updated **before** every provider-scoped production promote.  
**Related:** `docs/audits/marketing/MKT-001-META-PRODUCTION-RELEASE-ASSESSMENT.md`

---

## How to use this file

1. Cut a controlled release SHA from `staging` (do not blind-promote the whole branch).
2. Complete the shared platform gate and each enabled provider’s production gate.
3. Fill a new **Release entry** below (newest first).
4. Set Production env flags to match the entry (fail-closed: unset = disabled).
5. Deploy the exact SHA; run the smoke checklist; record PASS/FAIL.
6. On rollback, add a follow-up entry noting the rollback SHA and provider matrix.

**Server enforcement:** `apps/web/lib/promotions/providers/registry.ts` — all providers default **off** unless `MARKETING_PROVIDER_<KEY>=1`.

---

## Current production posture

| Field | Value |
|---|---|
| Status | **FOUNDATION RELEASED** (2026-07-20) — application + DB foundations on production; **all providers disabled** |
| Deployed merge SHA | `0e958bbd596402e07f838509c941ad53b220da1e` (contains approved tree `c052c315b8cfcb61fb1e397a3e4d0888728ef4e6`) |
| Fail-closed / manifest controls | **PASS** — providers remain off unless explicit `=1` |
| Assessment / closure | MKT-001L legal CONDITIONAL PASS; MKT-001M foundation closure |
| Meta Live / provider enablement | **NOT AUTHORIZED** |

| Provider | Production state |
|---|---|
| Facebook | Disabled |
| Instagram | Disabled |
| Google Business Profile | Disabled |
| LinkedIn | Disabled |
| Pinterest | Disabled |
| X | Disabled |

**Next authorization required (separate phrase):** provider enablement / Meta Live — not covered by foundation approval.

---

## Template (copy for each release)

```markdown
### Release YYYY-MM-DD — <short name>

| Field | Value |
|---|---|
| Release SHA | `<full git sha>` |
| Deployed at (UTC) | |
| Vercel deployment ID | |
| Operator owner | |
| Rollback SHA | `<previous production sha>` |
| Assessment / evidence links | |

#### Provider versions (from adapters)

| Provider | Adapter version | Enabled | Gate |
|---|---|---|---|
| facebook | e.g. `1.0.0` | yes/no | PASS/FAIL/N/A |
| google_business | e.g. `1.0.0` | yes/no | PASS/FAIL/N/A |
| instagram | stub / version | yes/no | PASS/FAIL/N/A |
| linkedin | stub | no | N/A |
| pinterest | stub | no | N/A |
| x | stub | no | N/A |

#### Environment (Production)

| Variable | Required value |
|---|---|
| `MARKETING_PROVIDER_FACEBOOK` | `1` or unset/`0` |
| `MARKETING_PROVIDER_INSTAGRAM` | `1` or unset/`0` |
| `MARKETING_PROVIDER_GOOGLE_BUSINESS` | `1` or unset/`0` |
| `MARKETING_PROVIDER_LINKEDIN` | unset/`0` |
| `MARKETING_PROVIDER_PINTEREST` | unset/`0` |
| `MARKETING_PROVIDER_X` | unset/`0` |
| `MARKETING_OAUTH_ENCRYPTION_KEY` | present (Production-scoped) |
| Meta / Facebook app + callback | verified |
| Cron secret (`process-social-publish-jobs`) | present |

#### Rollback procedure

1. Set enabled provider flags to `0` (immediate publish/job kill-switch), **or**
2. Redeploy Rollback SHA.
3. Confirm disabled providers remain off; history/ledger retained.
4. Record outcome in this entry.

#### Operator smoke checklist

- [ ] Health / deployment identity matches release SHA
- [ ] Disabled providers show as intentionally disabled (not failed)
- [ ] No tokens or raw Graph responses in UI/logs
- [ ] (If Facebook enabled) Connect Page; text post; image post; duplicate blocked
- [ ] (If Facebook enabled) Failure → retry/DLQ path confirmed
- [ ] (If Instagram enabled) Professional account + container publish
- [ ] (If GBP enabled) Connect + location post smoke (only after MKT-001A-PROD)

#### Decision

| Scope | GO / NO-GO |
|---|---|
| Shared platform | |
| Facebook | |
| Instagram | |
| GBP | |
| Overall promote | |
```

---

## Release history

### Release 2026-07-20 — foundation-providers-disabled (MKT-001M)

| Field | Value |
|---|---|
| Release SHA (approved tree) | `c052c315b8cfcb61fb1e397a3e4d0888728ef4e6` |
| Merge commit | `0e958bbd596402e07f838509c941ad53b220da1e` |
| Deployed at (UTC) | 2026-07-20T16:58:21Z |
| Vercel deployment | `HPtJGciRzRUA8WdQrUa6Dg4QpdhZ` / GitHub deploy `5525573947` |
| Rollback SHA | `ad5b4ccb242f2e1a3c4a98edf421820324a8e18e` |
| Evidence | `docs/audits/marketing/MKT-001M-foundation-production-release-closure.md` |

#### Provider matrix

| Provider | Enabled | Gate |
|---|---|---|
| facebook | **no** | Foundation only |
| google_business | **no** | Foundation only |
| instagram | **no** | Foundation only |
| linkedin | **no** | Foundation only |
| pinterest | **no** | Foundation only |
| x | **no** | Foundation only |

#### Environment (Production) — required record

| Variable | Required value |
|---|---|
| `MARKETING_PROVIDER_FACEBOOK` | `0` (preferred) or unset |
| `MARKETING_PROVIDER_INSTAGRAM` | `0` or unset |
| `MARKETING_PROVIDER_GOOGLE_BUSINESS` | `0` or unset |
| `MARKETING_PROVIDER_LINKEDIN` | `0` or unset |
| `MARKETING_PROVIDER_PINTEREST` | `0` or unset |
| `MARKETING_PROVIDER_X` | `0` or unset |

#### Decision

| Scope | GO / NO-GO |
|---|---|
| Shared platform foundation | **GO** |
| Facebook | **NO-GO** (disabled) |
| Instagram | **NO-GO** (disabled) |
| GBP | **NO-GO** (disabled) |
| Overall provider promote | **NO-GO** |

<!--
### Release YYYY-MM-DD — facebook-only-r1
(fill from template)
-->

---

## Roadmap (provider-scoped)

| Phase | Status |
|---|---|
| MKT-001A | Complete through staging (production blocker isolated to GBP) |
| MKT-001B | Complete |
| MKT-001B.2 Slice 1 | Complete |
| MKT-001C | Complete |
| MKT-001D | Complete |
| MKT-001E | Complete |
| MKT-001F | Complete |
| Fail-closed provider defaults | Implemented in registry (disabled unless explicitly enabled) |
| MKT-001G — Instagram / Meta Provider Readiness | **Next** |

Then:

1. Complete MKT-001G.
2. Verify Facebook production readiness.
3. Verify Instagram production readiness.
4. Keep GBP disabled by configuration (fail-closed + explicit off).
5. Produce / update provider-scoped production assessment.
6. Release a controlled production SHA with only approved providers enabled — record in this manifest.
7. Complete GBP later after Google approval (MKT-001A-PROD).
