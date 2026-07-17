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

## Current production posture (pre-first Meta release)

| Field | Value |
|---|---|
| Status | **NOT YET RELEASED** — marketing platform not on production |
| Fail-closed / manifest controls | **PASS** (2026-07-17) — see assessment §1c |
| Assessment | MKT-001 Meta Production Release Assessment |
| Next engineering | MKT-001G — Instagram / Meta Provider Readiness |
| Staging baseline (assessment) | `bf31401423b94e0d301800bb4be2a1613fa8ef85` |
| Staging Facebook testing | Requires explicit `MARKETING_PROVIDER_FACEBOOK=1` |
| Staging GBP | Unset or disabled unless deliberate test |

Until the first production entry is filled, treat production as:

| Provider | Intended production state |
|---|---|
| Facebook | Disabled until Facebook production gate PASS + explicit `MARKETING_PROVIDER_FACEBOOK=1` |
| Instagram | Disabled until MKT-001G + Instagram gate PASS |
| Google Business Profile | Disabled until MKT-001A-PROD closes |
| LinkedIn | Disabled |
| Pinterest | Disabled |
| X | Disabled |

**Full production authorization:** not yet granted. Authorized sequence: MKT-001G → Facebook controlled-post gate → manifest entry → verify Production flags → controlled SHA → enable only approved providers → GBP remains disabled.

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

_No production marketing-provider releases yet. Entries will be prepended here._

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
