# OPS-001 — Preview Environment Configuration & Verification

**Type:** Operations / deployment task (NOT an engineering remediation phase)
**Program:** Marketing Platform Remediation → operational handoff
**Supersedes next-action of:** `docs/audits/marketing/MKT-001A-RC3-keyed-pr-preview-live-verification.md`
**Related:** `docs/audits/marketing/MKT-001A-RC2-staging-operator-verification.md`, `docs/audits/environments/04-vercel-production-staging-development-variable-audit.md`
**Owner:** DevOps / release operator (Vercel + Supabase dashboard access)
**Status:** OPEN — blocks MKT-001A `PASS`, PR #38 merge, and production release
**Created:** 2026-07-16

---

## 1. Why this exists

MKT-001A engineering is **complete and verified** at the code + database layers (RC/RC2/RC3). RC3 proved that the only thing preventing the live verification matrix from running is **missing Preview-scoped runtime environment configuration** on the PR-branch preview — not any code, migration, security, database, or build defect.

This work is therefore reclassified as an **operations task (OPS-001)** to cleanly separate deployment configuration from engineering implementation.

### Root cause (confirmed by RC3 live evidence)

```
PR Preview (dpl_EqHfwzMPHWGmvX1XabTvcb5XVfyT @ 86efe59c)
        ↓
Missing Preview environment variables   ← runtime logs: urlPresent=false, serviceRoleKeyPresent=false, anonKeyPresent=false
        ↓
No Supabase client  →  No OAuth keys  →  No encryption key  →  No runtime backend
        ↓
Every data-backed / keyed / admin gate is a no-op (page renders in fallback mode)
```

The application renders (static/marketing routes work) and the code loads, but any request needing the database or the marketing encryption key falls back or fails closed because the runtime has no backend configuration.

---

## 2. Release status (as of RC3)

| Phase | Status |
|---|---|
| MKT-001 Audit | ✅ PASS |
| MKT-001A Implementation | ✅ PASS |
| MKT-001A RC | ✅ PASS |
| MKT-001A RC2 | ✅ PASS (conditional, operator prerequisites) |
| MKT-001A RC3 | ⚠️ CONDITIONAL PASS |
| **OPS-001 (this task)** | ⛔ OPEN |
| Merge (PR #38) | ⛔ Not authorized |
| Production | ⛔ NO-GO |

No new engineering remediation phase is authorized. The implementation is considered complete pending live confirmation once the environment is configured.

---

## 3. Known-good identifiers (use these; do not guess)

| Item | Value |
|---|---|
| PR | #38 — branch `fix/mkt-001a-security-hardening` |
| Deploy target SHA | `86efe59c` (`86efe59ca119ce69a62d4b9a9cd1d0bfbe32c6de`) |
| PR-HEAD deployment | `dpl_EqHfwzMPHWGmvX1XabTvcb5XVfyT` (Preview, READY) |
| Vercel project / team | `prj_eA7rHVSDiDXslAmrGwkdS4BtlVAc` / `team_gSaraaY4wPNKtO0Pfx5MY42D` |
| **Staging** Supabase ref (REQUIRED binding) | `gbgnemlpyykyhpqqbgru` (`shalean-platform-staging`, eu-west-3) |
| **Production** Supabase ref (MUST NOT be used for preview) | `tchayecuvzssixyxlvfu` (`shalean-platform`) |
| Approved base chain | `fix/mkt-001a-security-hardening` → `fix/r1.1-001-booking-date-fallback` → `staging` → `main` |

---

## 4. Scope

### 4.1 Environment — Preview scope ONLY

Configure the following on the Vercel **Preview** scope that applies to branch `fix/mkt-001a-security-hardening` (branch-scoped if the project uses branch-scoped Preview vars):

- `NEXT_PUBLIC_SUPABASE_URL` → staging (`gbgnemlpyykyhpqqbgru`) host
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → staging
- `SUPABASE_SERVICE_ROLE_KEY` → staging
- `MARKETING_OAUTH_ENCRYPTION_KEY` → fresh 64-char hex, staging-scoped
- `MARKETING_OAUTH_ENCRYPTION_KEY_PREVIOUS` → **only if** an existing staging OAuth row must decrypt (else omit)
- Any other marketing provider variables the implementation requires for the flows under test (e.g. `FACEBOOK_PAGE_ACCESS_TOKEN` / Google Business credentials) — staging/test values only

**Hard constraints**
- Do **NOT** modify the Production environment scope.
- Do **NOT** modify Production deployments or move production aliases.
- Never place secret values in git, logs, chat, the PR, or these reports.

### 4.2 Redeploy

Redeploy **PR #38 HEAD `86efe59c`** so the functions pick up the new Preview env. (Vercel requires a redeploy for env changes to take effect.)

### 4.3 Verify runtime now reports configuration present

After redeploy, a fresh request to a data-backed route (e.g. `/campaigns/<slug>`) must produce runtime logs showing:

```
urlPresent = true
anonKeyPresent = true
serviceRoleKeyPresent = true
```

and must **not** emit `[supabase] Admin client unavailable` / `[supabase] Server client unavailable`.

### 4.4 Verify Supabase binding

Confirm the redeployed preview reads **`gbgnemlpyykyhpqqbgru`** (staging) and **not** `tchayecuvzssixyxlvfu` (production). Behavioral proof: a staging-only promotion row (e.g. slug `env03-test-10`) renders with its real DB-backed content instead of the soft fallback.

### 4.5 Deployment access

Arrange authenticated access for verification. A temporary `_vercel_share` Deployment-Protection bypass is acceptable (RC3 created one that auto-expires in 23h; create a fresh one if expired). Reachability alone is **not** sufficient — the backend env (§4.1) must also be present.

---

## 5. Live verification matrix to complete (exit criteria)

Run against the backed, keyed, reachable PR-HEAD preview with an authorized admin session and a provider test target. Record redacted evidence for each.

| Gate | Required evidence |
|---|---|
| SSRF | Unsafe `imageUrl` targets (localhost/private/metadata/redirect-to-private) rejected pre-fetch; a valid HTTPS image path succeeds |
| Stored XSS | Seed raw `<script>`/`onerror`/`javascript:`/`<iframe>`/`<svg onload>` payload → confirm inert in-browser (no execution) **and payload actually rendered/sanitized**; valid formatting preserved; then clean up |
| OAuth decrypt (existing) | Existing connected account token decrypts — PASS, **or** document the absence of a legacy fixture |
| OAuth re-encrypt (new) | On reconnect, token stored in `v2:<keyId>` envelope |
| Publish idempotency | One provider operation under duplicate/concurrent requests (DB already enforces unique `(provider, idempotency_key)`) |
| Public rendering | Data-driven public campaign page renders correctly (not fallback) |
| Admin rendering | Marketing admin pages render for an authorized session |
| Marketing dashboard | Loads; connected-accounts + status surfaces render |
| Campaign workflow | Create/edit/generate campaign end-to-end |
| Connected Accounts | GBP / Facebook connect + status reflect correctly |
| Runtime log review | No tokens, keys, auth headers, or unsafe payloads leaked in logs |
| Production unchanged | Re-confirm 0 MKT-001A migrations on `tchayecuvzssixyxlvfu`; production Vercel still `main@ad5b4ccb` |

---

## 6. Exit → merge path

If **every** gate passes and the RC3 report is updated with: exact deployment identifier; operator + verification timestamp; redacted evidence; test-account/fixture identifiers; log-review result; final PASS decision — then:

```
MKT-001A = PASS
        ↓
Merge PR #38 → approved base chain (fix/r1.1-001-booking-date-fallback), NOT main
        ↓
staging
        ↓
Production Release Gate (separate phase)
        ↓
Production
```

A successful OPS-001 does **not** authorize production. Production remains a separate release phase (prod env-var mapping incl. `MARKETING_OAUTH_ENCRYPTION_KEY` present *before* deploy, prod Supabase identity, migration/recovery plan, deployment ordering, OAuth-key transition, smoke-test ownership, monitoring, final GO/NO-GO).

---

## 7. Governance amendment (proposed — permanent prerequisite)

Add to the Shalean Release Strategy as a standing gate:

> **No PR Preview requiring backend verification may enter RC unless all mandatory Preview environment variables are configured and validated before testing begins.**

**Pre-RC Preview readiness checklist**
- [ ] Preview Supabase URL present
- [ ] Preview Anon Key present
- [ ] Preview Service Role Key present
- [ ] Preview Marketing Encryption Key present
- [ ] Preview provider credentials present (where applicable)
- [ ] Runtime health endpoint confirms configuration (`urlPresent/anonKeyPresent/serviceRoleKeyPresent = true`)
- [ ] Deployment Protection access arranged before verification

Applying this gate before RC would have surfaced the missing-configuration condition prior to RC3 and avoided investigating behavior ultimately caused by missing runtime configuration.

**Optional supporting improvement:** expose a lightweight, non-secret runtime health endpoint (booleans only — presence, never values) so preview readiness can be validated with a single request rather than by inspecting logs.

---

## 8. Handoff summary

- **Do:** configure Preview-scoped env (§4.1) for staging `gbgnemlpyykyhpqqbgru`, redeploy `86efe59c`, verify presence + binding, run §5 matrix, record evidence in the RC3 report, return for merge authorization.
- **Do not:** touch Production scope or deployments; place secrets in tracked artifacts; merge before a clean live PASS.
- **Status stays:** MKT-001A CONDITIONAL PASS; PR #38 open; production NO-GO — until OPS-001 completes.
