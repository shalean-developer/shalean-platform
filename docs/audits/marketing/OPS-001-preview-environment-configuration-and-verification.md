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

## 8a. Execution-attempt log (agent verification, 2026-07-16T21:19Z)

An automated verification pass was run against the latest PR HEAD to establish current state. It did **not** and **could not** perform the env-configuration steps (§4.1–§4.2), which require operator Vercel dashboard/CLI credentials not available to the agent environment (no env-var write tool; no Vercel CLI — confirmed in RC3).

| OPS-001 step | Attempted outcome |
|---|---|
| 1–2. Configure Preview env / confirm staging binding | **NOT POSSIBLE from agent env** — no Vercel env-write capability. Unchanged. |
| 3. Redeploy latest PR HEAD (`d1b4510f`) | **DONE (auto)** — the `d1b4510f` push auto-created preview `dpl_BnjkHU46E1eFTqt3vG1EULqMCPd9` (READY). |
| 4. Temporary Deployment-Protection bypass | **DONE** — `_vercel_share` link created for the new deployment (23h TTL). |
| 5. Confirm runtime configuration | **FAIL — backend still absent.** Live runtime logs for `dpl_BnjkHU46E1eFTqt3vG1EULqMCPd9` on `/campaigns/env03-test-10`, `/api/promotions`, `/blog/*` show `urlPresent: false`, `serviceRoleKeyPresent: false`, `anonKeyPresent: false`. Public campaign page renders in **fallback mode** (staging row not read). |
| 6. Live verification matrix | **NOT STARTED** — cannot begin without a configured backend (§5 precondition unmet). |
| 7. Update report + decision | This section. |

**Interpretation.** The redeploy alone does **not** resolve OPS-001: a new build on the same (unconfigured) Preview scope inherits the same absent env. Step 1 (operator env configuration) is the gating action and has not occurred. No live security control was executed, so none passed or failed.

**Decision (this attempt):** OPS-001 **remains OPEN / BLOCKED at step 1**. MKT-001A stays **CONDITIONAL PASS**; PR #38 open; production NO-GO. This is neither a control PASS nor a control failure — it is an unmet environment precondition.

**Ready-to-resume trigger.** As soon as an operator configures the §4.1 Preview variables (for staging `gbgnemlpyykyhpqqbgru`) and a fresh PR-HEAD deployment reports `urlPresent/anonKeyPresent/serviceRoleKeyPresent = true`, the agent can immediately execute the full §5 live matrix (SSRF, stored-XSS render, OAuth decrypt/`v2` re-encrypt where a fixture/admin session is available, publish idempotency, public + admin rendering, dashboard/connected-accounts smoke, log scan) and record evidence here.

---

## 8b. Root-Cause Diagnosis — Preview Git-Branch Scope Mismatch

**Diagnosis date:** 2026-07-16T21:38Z · **Mode:** read-only code + runtime trace · **Scope target:** PR branch `fix/mkt-001a-security-hardening`, deployment `dpl_BnjkHU46E1eFTqt3vG1EULqMCPd9` @ `d1b4510f`.

### Verdict

The missing values are **not** a code defect, a variable-name mismatch, a `NEXT_PUBLIC_*` build-inlining artifact, or a runtime-initialization bug. They are a **Vercel environment *scope* mismatch**: the Supabase (and Paystack / URL / identity) variables are configured as **Preview + specific git-branch** records scoped to the **`staging`** (and `development`) branches — not "all Preview branches." The PR-branch preview `fix/mkt-001a-security-hardening` therefore receives **none** of them. The code reads the correct names; there is simply nothing in `process.env` for this branch's deployment to read.

### Decisive runtime evidence — `/api/health/environment`

Live fetch on the PR-HEAD preview (`dpl_BnjkHU46E1eFTqt3vG1EULqMCPd9` @ `d1b4510f`, via temporary bypass):

```json
{"status":"ok","service":"shalean-environment","timestamp":"2026-07-16T21:37:56.190Z",
 "deployment":"preview","vercelEnv":"preview","gitBranch":"fix/mkt-001a-security-hardening",
 "shaleanAppEnv":null,
 "supabase":{"configuredRef":null,"expectedRef":null,"urlHost":null},
 "paystack":{"secretMode":"missing","publicMode":"missing","secretPrefix":"(unset)","publicPrefix":"(unset)"},
 "messaging":{"outboundDisabled":false,"emailAllowlistConfigured":false,"phoneAllowlistConfigured":false,"smsOutboundEnabled":false},
 "issues":[]}
```

The deployment is genuinely in the **Preview** environment (Vercel *system* vars `VERCEL_ENV=preview`, `VERCEL_GIT_COMMIT_REF` are present), yet **every custom project variable is absent** — Supabase, Paystack, `SHALEAN_APP_ENV`, the outbound-email allowlist. That breadth is the tell: a name or inlining problem would affect only specific variables; an entire empty custom-env set points to branch-scope filtering. `issues:[]` is expected here because with no Supabase URL at all there is nothing to mismatch, and `VERCEL_GIT_COMMIT_REF` is present (so `env_identity_unknown` does not fire).

### Evidence table 1 — code paths that read the variables / report the flags

| Flag / client | File & line | Exact `process.env.*` read | Expected Vercel var(s) | Name mismatch? |
|---|---|---|---|---|
| `urlPresent`, `serviceRoleKeyPresent` (Admin) | `apps/web/lib/supabase/admin.ts:31–34`, logged `:9–12` | `NEXT_PUBLIC_SUPABASE_URL` \|\| `SUPABASE_URL`; `SUPABASE_SERVICE_ROLE_KEY` \|\| `SUPABASE_SERVICE_KEY` | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | No — names match exactly; values absent for this branch |
| `urlPresent`, `anonKeyPresent` (Server/SSR) | `apps/web/lib/supabase/server.ts:23–24`, logged `:10–13` | `NEXT_PUBLIC_SUPABASE_URL`; `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same | No — absent for this branch |
| Browser client | `apps/web/lib/supabase/browser.ts:84–85` (guarded by `typeof window`) | `NEXT_PUBLIC_SUPABASE_URL`; `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same | No — client-inlined at build; also absent |
| Health `configuredRef`/`urlHost` | `apps/web/app/api/health/environment/route.ts:21` | `NEXT_PUBLIC_SUPABASE_URL` ?? `SUPABASE_URL` | same | Reports `null` → confirms both absent |
| Build env-safety gate | `apps/web/lib/env/assertEnvironmentSafety.ts:115` | `NEXT_PUBLIC_SUPABASE_URL` ?? `SUPABASE_URL` | same | No `supabase_ref_mismatch` raised (actual+expected both null) |
| Image host (build) | `apps/web/next.config.ts:34` | `NEXT_PUBLIC_SUPABASE_URL` | same | Undefined at build → no Supabase image host registered |

Every read targets the exact names the operator configured (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) plus optional server-side aliases (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`). A name mismatch is ruled out.

### Evidence table 2 — the four candidate causes tested against evidence

| Candidate cause | Fits evidence? | Why |
|---|---|---|
| Name mismatch | Ruled out | Code reads the identical names (+ correct aliases). If present, they would be read. |
| `NEXT_PUBLIC` build-inlining artifact (public vars stripped at runtime) | Not the cause | The non-public runtime var `SUPABASE_SERVICE_ROLE_KEY` (read live from `process.env`, never inlined) is *also* missing. An inlining issue cannot explain a plain runtime var being absent. |
| Runtime initialization bug (client built before env read, stale cache) | Ruled out | Module-scope caches only memoize a correctly-computed null. The `force-dynamic` health endpoint independently reports `configuredRef:null` on a fresh read. Logic is sound; inputs are empty. |
| **Scope / git-branch targeting mismatch** | **Root cause** | `VERCEL_ENV=preview` present but *all* custom vars empty — matches Preview vars being filtered to specific branches this deployment is not on. |

### Corroboration — the project's own scope contract (ENV-04)

`docs/audits/environments/04-vercel-production-staging-development-variable-audit.md`:

- **Approved Environment Model** places Supabase / Paystack / URLs / `SHALEAN_APP_ENV` / `CRON_SECRET` / `ADMIN_EMAILS` under **"Preview `staging`"** (and Preview `development`).
- **Matrix rows 129–131:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` = **"Present (branch)" → "Correctly isolated."**
- **Line 46:** "'Development' … means **Preview + git branch `development`**."
- **Line 123:** only **45 *unscoped* Preview keys** "bleed into all Preview branches" — Supabase is deliberately **not** among them; it is branch-scoped.

So the variables genuinely exist in Preview, but bound to `git branch = staging` (and `development`). A PR preview for `fix/mkt-001a-security-hardening` is on neither branch, so it inherits only the 45 unscoped Preview secrets + Vercel system vars — exactly what the health endpoint shows.

### Root cause (one sentence)

> The Supabase Preview variables are scoped to **Preview + git branch `staging`/`development`**, so the `fix/mkt-001a-security-hardening` PR-branch preview receives none of them; `urlPresent`/`anonKeyPresent`/`serviceRoleKeyPresent` are all false because those names are simply not in this deployment's environment — the code and variable names are correct.

### Remediation direction (diagnosis only — not applied)

Broaden the **scope** (rename nothing), then **redeploy** (required both because Vercel binds env to a deployment at build time and because the `NEXT_PUBLIC_*` values are inlined at build):

1. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (+ `MARKETING_OAUTH_ENCRYPTION_KEY`) as Preview records that **also target the `fix/mkt-001a-security-hardening` branch**, pointing at staging `gbgnemlpyykyhpqqbgru`. (Per governance, do not push PR HEAD onto the persistent `staging` branch merely to inherit its scope.)
2. Redeploy PR HEAD.
3. Verify via `/api/health/environment`: expect `supabase.configuredRef = gbgnemlpyykyhpqqbgru`, `urlHost` non-null.

### No code change required

The application code, variable names, alias fallbacks, `NEXT_PUBLIC_*` handling, and client-initialization logic are all correct. OPS-001 is an **environment-scoping** action, not an engineering change. Confirmed: **no code modification is required or recommended.**

---

## 8. Handoff summary

- **Do:** configure Preview-scoped env (§4.1) for staging `gbgnemlpyykyhpqqbgru`, redeploy `86efe59c`, verify presence + binding, run §5 matrix, record evidence in the RC3 report, return for merge authorization.
- **Do not:** touch Production scope or deployments; place secrets in tracked artifacts; merge before a clean live PASS.
- **Status stays:** MKT-001A CONDITIONAL PASS; PR #38 open; production NO-GO — until OPS-001 completes.
