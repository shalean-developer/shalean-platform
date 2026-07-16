# MKT-001A-RC3 — Keyed PR-Preview Live Security Verification

**Program:** Marketing Platform Remediation
**Phase:** MKT-001A-RC3 (Keyed PR-Preview Live Security Verification)
**Mode:** Controlled PR-preview live verification — **production untouched**
**Source governance:** Final Governance Decision (RC2 CONDITIONAL PASS; safer staging strategy approved)
**Source RC2:** `docs/audits/marketing/MKT-001A-RC2-staging-operator-verification.md`
**Source RC:** `docs/audits/marketing/MKT-001A-RC-staging-security-verification.md`
**Date:** 2026-07-16
**Operator:** Cursor agent (automated verification session)
**Verification timestamp:** 2026-07-16T21:00Z (bypass created 2026-07-16T20:58Z UTC; runtime-log window 20:31–21:01Z)

---

## 0. Executive decision

**CONDITIONAL PASS — unchanged. PR #38 stays open. Production remains NO-GO.**

RC3 made **real new progress** on the operational-evidence gap that blocked RC2, and it also surfaced a **material, previously-unproven infrastructure fact** that redefines the remaining operator work:

- **Resolved (new):** the Deployment-Protection blocker from RC2 §1(2). A temporary, controlled authenticated-access bypass link was created for the PR-HEAD preview and the deployment was confirmed **reachable and rendering** (governance step 4).
- **Confirmed (new):** the PR-HEAD deployment `dpl_EqHfwzMPHWGmvX1XabTvcb5XVfyT` is built from the exact PR HEAD SHA `86efe59c` (governance step 5).
- **Newly proven blocker:** the PR-HEAD preview deployment has **no backend environment at all** — not just the missing `MARKETING_OAUTH_ENCRYPTION_KEY`, but **no Supabase URL / service-role / anon key either**. Live runtime logs from this deployment show `urlPresent: false, serviceRoleKeyPresent: false` (and `anonKeyPresent: false`). Therefore the deployment is **NOT bound to Supabase `gbgnemlpyykyhpqqbgru`** (governance step 6 **fails on this preview**), and **every data-backed gate cannot execute** on it.

The security controls remain verified at the code + DB layer exactly as in RC2 (62/62 focused suites; live staging-DB financial-access and idempotency proofs). No security control regressed. The shortfall is still **operational evidence**, now with a precisely-identified root cause: **the PR-branch preview does not inherit the Preview-scoped backend env vars**, and **this environment has no Vercel env-write tooling** to add them.

---

## 1. Governance sequence — execution results

The approved (safer) strategy was: keep PR #38 unmerged; configure the staging-only secret + a controlled Deployment-Protection bypass on the PR-HEAD preview; verify against `dpl_EqHfwzMPHWGmvX1XabTvcb5XVfyT`; run the live matrix; tear down; update the report.

| # | Governance step | Result | Evidence |
|---|---|---|---|
| 1 | Keep PR #38 unmerged | **DONE** | No merge performed; local HEAD `86efe59c` on `fix/mkt-001a-security-hardening`; production deployment unchanged (§4). |
| 2 | Configure `MARKETING_OAUTH_ENCRYPTION_KEY` for PR-preview scope | **NOT DONE — operator-only** | No Vercel env-var **write** capability in this environment (MCP exposes read/inspect + share-link + `deploy_to_vercel` only); Vercel CLI not installed. Secret must never transit chat/logs/git. |
| 3 | Add previous/legacy key if fixtures require | **N/A / NOT DONE** | Depends on step 2; not reachable. No connected OAuth fixture confirmable (§3, gate 7). |
| 4 | Grant temporary, controlled Deployment-Protection bypass | **DONE** | `_vercel_share` access link created for `dpl_EqHfwzMP…`; **expires 2026-07-17 ~19:58 local (23h)**. Auto-expiring, single deployment scope. |
| 5 | Use PR-HEAD deployment `dpl_EqHfwzMPHWGmvX1XabTvcb5XVfyT` | **DONE** | Confirmed READY; `githubCommitSha = 86efe59ca119ce69a62d4b9a9cd1d0bfbe32c6de`; PR #38; branch `fix/mkt-001a-security-hardening`. |
| 6 | Confirm deployment bound to Supabase `gbgnemlpyykyhpqqbgru` | **FAIL (this preview)** | Runtime logs prove the deployment has **no Supabase env** (`urlPresent:false`, `serviceRoleKeyPresent:false`, `anonKeyPresent:false`). It is bound to **no** Supabase project, hence not to `gbgnemlpyykyhpqqbgru`. |
| 7 | Execute remaining live verification matrix | **BLOCKED** | All data-backed / keyed / admin-authenticated gates require the deployment's backend env, which is absent (§3). |
| 8 | Remove/rotate temporary bypass after testing | **AUTO** | Share link self-expires in 23h; no persistent protection change was made. Operator may rotate proactively if desired. |
| 9 | Update the RC report | **DONE** | This document + RC2 §9 next-action updated. |
| 10 | Return for final merge authorization | **DONE** | Returned: **still CONDITIONAL PASS**, with a narrowed, precise operator action (§5). |

---

## 2. Environment & identity (live-verified)

| Layer | Value | Verified |
|---|---|---|
| PR-HEAD deployment | `dpl_EqHfwzMPHWGmvX1XabTvcb5XVfyT`, Preview (`target=null`), READY | Live `get_deployment` |
| Deployment SHA | `86efe59ca119ce69a62d4b9a9cd1d0bfbe32c6de` (= PR HEAD `86efe59c`, PR #38) | Live `get_deployment` meta |
| Deployment URL | `shalean-platform-2pai1btkr-shalean-cleaning-services.vercel.app` | Live |
| Vercel project / team | `prj_eA7rHVSDiDXslAmrGwkdS4BtlVAc` / `team_gSaraaY4wPNKtO0Pfx5MY42D` | `.vercel/project.json`; live |
| Access bypass | `_vercel_share` temporary link, 23h TTL | Live `get_access_to_vercel_url` |
| Reachability | Home + marketing routes render (title suffixed ` | PREVIEW`); `/campaigns/[slug]` renders | Live browser + `get_runtime_logs` |
| **Deployment backend env** | **Supabase URL/service-role/anon ALL absent** | Live `get_runtime_logs` on this deployment |
| Staging Supabase (DB) | `gbgnemlpyykyhpqqbgru` — both MKT-001A migrations still applied & verified | Live `execute_sql` |
| Production Supabase | `tchayecuvzssixyxlvfu` — 0 MKT-001A migrations, no safe view, no idempotency table | Live `execute_sql` (§4) |
| Production Vercel | `dpl_EwbyVrZ5xY4iLss9yYjjhkqqJsku` @ `ad5b4ccb` (main) — unchanged | Live `list_deployments` |

**Key distinction vs RC2.** RC2 recorded the staging **database** as `gbgnemlpyykyhpqqbgru` (true — the migrations are applied there) and inferred the preview "points at" it. RC3 tested the **deployment→database binding directly** and found the PR-branch preview carries **no** Supabase connection env. The DB is correct; the *preview's wiring to it* does not exist.

---

## 3. Live gate matrix (RC3 result)

| # | Gate | Required | RC3 result | Evidence |
|---|---|---|---|---|
| 1 | Staging key configuration | Correct scope; no disclosure | **NOT DONE — operator-only** | No env-write tooling; see §1 step 2. |
| 2 | Deployment access (temporary bypass) | Authorized bypass | **PASS** | `_vercel_share` link, 23h TTL; deployment reachable (rendered marketing pages live). |
| 3 | Deployment SHA `86efe59c` | Match | **PASS** | `get_deployment` → `githubCommitSha 86efe59c…`, PR #38. |
| 4 | Supabase binding `gbgnemlpyykyhpqqbgru` | Match | **FAIL on preview** | Runtime logs: deployment has **no** Supabase env; not bound to any project. |
| 5 | Live SSRF tests (unsafe rejected; valid image path OK) | PASS | **BLOCKED** | Admin publish endpoints require admin auth + backend env; neither present on this preview. Control remains code-verified (23/23). |
| 6 | Browser XSS test (no exec; formatting preserved) | PASS | **ATTEMPTED — inconclusive live** | A raw `<script>`/`onerror`/`javascript:`/`<iframe>`/`<svg onload>` payload was seeded into staging `promotions.terms_html` (write-time sanitize deliberately bypassed via direct SQL). The public page **fell back to the default promo** because the preview cannot read the DB (no Supabase env), so the seeded payload **never rendered**; the DOM `.prose` container contained only the safe default string, `window.__xss_*` sentinel **not** fired, `iframe`/`img[onerror]` **absent**. This confirms *no accidental exposure* but does **not** exercise the render-time sanitizer against the payload. Control remains code-verified (12/12). Seeded row **restored to NULL** afterward. |
| 7 | Existing OAuth decrypt (PASS or documented no fixture) | PASS/absence | **BLOCKED** | Requires key + backend env + connected account; none present. |
| 8 | New OAuth encryption `v2` verified | PASS | **BLOCKED** | Requires key; fail-closed without it. Control code-verified (11/11: `v2:<keyId>` envelope, rotation, no `GOOGLE_CLIENT_SECRET` fallback). |
| 9 | Publish idempotency (one op under duplicate/concurrent) | PASS | **DB PASS / provider E2E BLOCKED** | Live staging DB still enforces unique `(provider, idempotency_key)` (`23505`); provider double-submit E2E needs keyed backend + provider. |
| 10 | Public campaign render | PASS | **PARTIAL** | The route renders live (HTTP 200, layout intact) via the bypass link, but in **fallback mode** (no DB); a true data-driven render needs the backend env. |
| 11 | Marketing UI smoke tests | PASS | **BLOCKED** | Admin session + backend env required. |
| 12 | Staging log review (no tokens/keys/headers/payloads) | PASS | **PASS (for this deployment)** | Runtime logs contained no tokens, keys, auth headers, or unsafe payloads — only benign, typed "config absent" `console.error` lines (`urlPresent:false…`). No secret leakage. |
| 13 | Production unchanged | PASS | **PASS** | §4. |

**Legend.** "BLOCKED" = end-to-end confirmation requires a backend-configured (Supabase + encryption key) reachable PR-HEAD deployment and, for some gates, an authorized admin session — none available from this environment. Code/DB proofs are unchanged from RC2/RC.

---

## 4. Production non-impact (live-verified)

- **Production Supabase `tchayecuvzssixyxlvfu`:** MKT-001A migrations applied = **0**; `public_active_promotions` view **absent**; `marketing_publish_idempotency` table **absent**. Unchanged.
- **Production Vercel:** latest `target=production` deployment remains `dpl_EwbyVrZ5xY4iLss9yYjjhkqqJsku` @ `ad5b4ccb` (branch `main`). The PR-HEAD preview did **not** become production and no production alias moved.
- No production environment variable was added, changed, or read for its value. The temporary bypass was scoped to the single **preview** deployment.

---

## 5. What the operator must still do (RC3 → merge) — narrowed & precise

RC3 narrows the remaining work to two operator actions plus the previously-known credential need:

1. **Configure the PR-branch preview's backend env (the real blocker).** On the Vercel project, ensure the **Preview scope that applies to `fix/mkt-001a-security-hardening`** carries:
   - `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`) → the **staging** project `gbgnemlpyykyhpqqbgru` host,
   - `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SERVICE_KEY`) for staging,
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` for staging,
   - `MARKETING_OAUTH_ENCRYPTION_KEY` (fresh 64-char hex, staging-scoped), and `MARKETING_OAUTH_ENCRYPTION_KEY_PREVIOUS` / legacy `SOCIAL_TOKEN_ENCRYPTION_KEY` **only if** an existing staging OAuth row must decrypt.
   Then **redeploy the PR HEAD** (`86efe59c`) so the functions pick up the env. *Root cause identified by RC3:* the auto-generated PR-branch preview currently inherits **none** of these (proven by runtime logs), which is why every data-backed gate is inert. Never place secret values in git/logs/chat/PR/these reports.
2. **Re-run the live matrix (gates 4–11)** against the now-backed, reachable PR-HEAD deployment with an **authorized admin session** and a **provider test target**: SSRF malicious `imageUrl` rejection + valid HTTPS image publish; XSS payload inert in-browser **with the payload actually rendered** (re-seed the `terms_html` payload, confirm sanitized output, then clean up); existing-account decrypt + `v2` re-encrypt on reconnect; provider double-submit → one external post; data-driven public campaign render; marketing UI smoke; then scan logs for secret/token/payload patterns.
3. **Record exact evidence** (deployment SHA, URLs, HTTP results, screenshots, sanitized log scan, fixture/test-account IDs) here, then return for merge authorization.

> Note for step 1: the current temporary `_vercel_share` bypass link only defeats **Deployment Protection (SSO)**; it does **not** supply application env vars. Reachability ≠ backend configuration. Both are required for the keyed matrix.

---

## 6. Test-data & teardown ledger (RC3 actions taken)

| Action | Target | Detail | Reverted |
|---|---|---|---|
| Seed XSS payload | staging `promotions` `slug=env03-test-10` | Set `terms_html` to raw `<script>/<img onerror>/javascript:/<iframe>/<svg onload>` + valid formatting (380 chars) via direct SQL to bypass write-time sanitize | **Yes** — restored to `NULL` (`terms_html IS NULL` re-verified) |
| Create access bypass | preview `dpl_EqHfwzMP…` | `_vercel_share` link, 23h TTL | Auto-expires; no persistent protection change |
| Browser navigation | preview home + `/campaigns/env03-test-10` | Read-only render + DOM inspection | N/A (no state change) |
| DB reads | staging + production Supabase | `SELECT`/verification only | N/A |

No production data or environment was touched. Pre-existing staging test row `env03-test-10` retained (only its transient `terms_html` was added then removed).

---

## 7. Merge rule & production boundary (unchanged from governance)

- **Merge:** PR #38 may be authorized only after all remaining live gates (§5 step 2) pass and this report is updated with the exact deployment identifier, operator + timestamp, redacted evidence, fixture/test-account IDs, log-review result, and a final PASS decision. Then merge into the **approved base chain** (`fix/r1.1-001-booking-date-fallback`), not directly into `main`.
- **Production:** a successful RC3 does **not** authorize production. Production requires the separate release phase (prod env-var mapping incl. `MARKETING_OAUTH_ENCRYPTION_KEY` present *before* deploy, prod Supabase identity, migration/recovery plan, deployment ordering, OAuth-key transition, smoke-test ownership, monitoring, final GO/NO-GO).

---

## 8. Final authorization (RC3)

**CONDITIONAL PASS.** PR #38 stays **open**; production **NO-GO**.

- **New this phase:** Deployment-Protection bypass achieved (governance step 4) and PR-HEAD SHA binding confirmed (step 5) — the RC2 "SSO wall" blocker is resolved and reachability is proven.
- **New blocker surfaced:** the PR-branch preview carries **no backend env** (no Supabase, no encryption key), so it is not bound to `gbgnemlpyykyhpqqbgru` and cannot run the keyed live matrix. This replaces the RC2 assumption "preview points at staging" with a directly-tested fact and a precise remediation (§5 step 1).
- **No failed security control.** All code + DB controls remain verified; the outstanding items are operator infrastructure (env configuration + admin/provider credentials), not defects.

## 9. Next authorized action

**Reclassified as an operations task — not another engineering remediation phase.**

> **OPS-001 — Preview Environment Configuration & Verification.**
> See `docs/audits/marketing/OPS-001-preview-environment-configuration-and-verification.md`.
> Operator: configure the Preview-scoped backend env (Supabase URL/anon/service-role for staging `gbgnemlpyykyhpqqbgru` + `MARKETING_OAUTH_ENCRYPTION_KEY`, and `MARKETING_OAUTH_ENCRYPTION_KEY_PREVIOUS`/provider creds if required); redeploy PR HEAD `86efe59c`; confirm the runtime reports `urlPresent/anonKeyPresent/serviceRoleKeyPresent = true` and reads `gbgnemlpyykyhpqqbgru` (not `tchayecuvzssixyxlvfu`); then execute the live matrix with an authorized admin session + provider target, record redacted evidence back into this report (§3/§5), and return for final merge authorization into the approved base chain. Do not modify Production scope or deployments.
