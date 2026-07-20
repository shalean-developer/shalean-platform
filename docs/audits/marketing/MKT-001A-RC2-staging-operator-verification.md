# MKT-001A-RC2 — Staging Operator Verification & Final Merge Gate

**Program:** Marketing Platform Remediation
**Phase:** MKT-001A-RC2 (Release Candidate 2 / Final Security & Merge Gate)
**Mode:** Controlled staging operator verification — **production untouched**
**Source RC:** `docs/audits/marketing/MKT-001A-RC-staging-security-verification.md`
**Source implementation:** `docs/audits/marketing/MKT-001A-security-hardening-implementation.md`
**Date:** 2026-07-16
**Evidence:** `docs/audits/marketing/evidence/mkt-001a-rc2-db-matrix-2026-07-16.json`

---

## 0. Governance correction acknowledged

RC governance required deploying **PR HEAD `86efe59c`**, not code commit `0a481c20`, for release traceability.

**Confirmed:** the newest Vercel deployment for the PR is `dpl_EqHfwzMPHWGmvX1XabTvcb5XVfyT` built from `githubCommitSha = 86efe59ca119ce69a62d4b9a9cd1d0bfbe32c6de` (PR #38, branch `fix/mkt-001a-security-hardening`) — i.e. the exact PR HEAD. The earlier `0a481c20` preview (`dpl_4F6wVNuVTHpLn5JEayjxH5yYCnGt`) is superseded. All RC2 traceability references PR HEAD `86efe59c`.

---

## 1. Executive decision

**CONDITIONAL PASS.** PR #38 **remains open and must not be merged.** Production remains **NO-GO.**

RC2 was able to advance and **live-verify every gate that the code and the staging database can prove** (identity, financial-access matrix, idempotency constraint, the security-definer-view exception, production non-impact, and the code-layer security suites). These now carry live, reproducible evidence — not memory or assertion.

However, the **release-gating operator prerequisites could not be executed from this verification environment**, for two hard, honestly-reported reasons:

1. **No Vercel environment-variable or git-deploy tooling is available here.** The Vercel MCP surface exposes only read/inspection tools (`list_deployments`, `get_deployment`, `get_runtime_logs`) plus `deploy_to_vercel` (which creates a *new* file-tree project, not a redeploy of this git-linked repo). There is no env-var write capability, and the Vercel CLI is not installed. `MARKETING_OAUTH_ENCRYPTION_KEY` therefore **cannot** be set on staging from here, and the PR HEAD **cannot** be deployed to the persistent staging target from here.
2. **All Vercel Preview deployments are behind Deployment Protection (SSO wall).** Both the PR-HEAD preview and the persistent `staging`-branch preview return the Vercel login page for unauthenticated requests. The live SSRF/XSS/encryption/publish HTTP+browser matrix, the public-page render, and the live secret/log scan of keyed flows all require an authenticated, reachable staging deployment carrying the new code **and** the encryption key — none of which exists yet.

These are **operator infrastructure steps**, not development or security defects. The security controls themselves are verified. Per the RC2 authorization boundary, unresolved operational evidence ⇒ **CONDITIONAL PASS** (keep the PR open, resolve the remaining operational evidence).

---

## 2. Environment & identity (live-verified)

| Layer | Staging | Production | Verified |
|---|---|---|---|
| Supabase ref | `gbgnemlpyykyhpqqbgru` (`shalean-platform-staging`, eu-west-3) | `tchayecuvzssixyxlvfu` (`shalean-platform`, eu-west-3) | Live `list_projects` — distinct refs |
| Vercel project | `prj_eA7rHVSDiDXslAmrGwkdS4BtlVAc` (team `team_gSaraaY4wPNKtO0Pfx5MY42D`) | same project, `target=production` | Live `list_deployments` |
| PR HEAD deployment | `dpl_EqHfwzMPHWGmvX1XabTvcb5XVfyT` @ `86efe59c` (Preview, `target=null`, READY) | — | Live |
| Latest production deployment | — | `dpl_EwbyVrZ5xY4iLss9yYjjhkqqJsku` @ `ad5b4ccb` (`main`, `target=production`) | **Unchanged by this phase** |

No RC2 action targeted the production ref or production Vercel scope.

---

## 3. Live gate matrix (RC2 result)

| # | Gate | Required | RC2 result | Evidence |
|---|---|---|---|---|
| 1 | Staging encryption key configured | PASS | **NOT DONE — operator-only** | No Vercel env-var tooling in this environment; secret must never transit chat/logs. Operator dashboard/CLI step. |
| 2 | Deployment SHA equals PR HEAD | PASS | **PASS (SHA) / caveat** | PR-HEAD preview `dpl_EqHfwzMP…` == `86efe59c`. Caveat: it is a **PR-branch preview** without staging env or the encryption key, and is **not** the persistent staging target. |
| 3 | Staging Supabase identity `gbgnemlpyykyhpqqbgru` | match | **PASS** | Live `list_projects`; both migrations applied on this ref. |
| 4 | SSRF live rejection | PASS | **CODE PASS / live BLOCKED** | 23/23 `safeRemoteMedia` tests; central `fetchRemoteImageSafely` wired into FB path, GBP forward URL validated. Live HTTP replay needs keyed reachable staging + admin auth. |
| 5 | Valid HTTPS media path | PASS | **CODE PASS / live BLOCKED** | Covered by allowlist/MIME tests; live upload needs provider target. |
| 6 | Stored-XSS browser test | PASS | **CODE PASS / live BLOCKED** | 12/12 `campaignTermsHtml` tests (write + render sanitize). In-browser confirm needs reachable staging + admin session. |
| 7 | Existing OAuth token decrypt | PASS or confirmed no fixture | **BLOCKED** | Requires the key + a connected OAuth account; fixture existence not confirmable without a keyed deployment. |
| 8 | New OAuth token v2 encryption | PASS | **CODE PASS / live BLOCKED** | 11/11 `tokenEncryption` tests: `v2:<keyId>` envelope, rotation, previous/legacy decrypt, **no `GOOGLE_CLIENT_SECRET` fallback**, fail-closed. |
| 9 | Provider publish idempotency | PASS | **LIVE DB PASS + code PASS / provider E2E BLOCKED** | Live duplicate `(provider, idempotency_key)` → `23505`; 10/10 unit tests. Double-click-through-provider E2E needs keyed staging + provider. |
| 10 | Public financial-field denial | PASS | **PASS (live DB)** | anon base-table SELECT → `42501`; `budget_zar`/`revenue_generated_zar` column privilege = false; INSERT/UPDATE/DELETE = false. |
| 11 | Authorized admin financial access | PASS | **PASS (live DB)** | `service_role` retains SELECT on `promotions`; app reads server-side via service role. |
| 12 | Public campaign page | PASS | **CODE PASS / live BLOCKED** | Render-time sanitization covered by tests; live page render behind Deployment Protection. |
| 13 | Marketing UI smoke tests | PASS | **BLOCKED** | Deployment Protection + admin auth required. |
| 14 | Secret/log review | PASS | **SOURCE PASS / live BLOCKED** | Source review + unit behavior: safe-media never logs full URL; token module never logs key/token; idempotency logs key/hash + status only. Live log scan of keyed flows pending. |
| 15 | Production unchanged | PASS | **PASS** | Prod DB: 0 MKT-001A migrations, no safe view, no idempotency table; prod anon grant still present (pre-existing). Prod Vercel still `main@ad5b4ccb`. No prod env changed. |

**Legend.** "CODE PASS" = the control is proven correct by passing unit tests and source review; "live BLOCKED" = end-to-end confirmation against a running, keyed, reachable staging deployment is the outstanding operator step.

Focused suites re-run at RC2 with `vitest 3.2.6`: **62/62 passed** (SSRF 23, XSS 12, encryption 11, idempotency 10, GBP 6).

---

## 4. Security-definer view — documented security exception

The `public_active_promotions` advisor warning (`0010_security_definer_view`, level ERROR) is **accepted as a documented, evidence-backed exception**, not dismissed as a false positive. All six required conditions are proven live on staging (`gbgnemlpyykyhpqqbgru`):

| Condition | Proof | Result |
|---|---|---|
| Exposes only approved public columns | `information_schema.columns` → **36 columns**, none sensitive; excludes `budget_zar`, `budget_spent_zar`, `revenue_generated_zar`, `usage_limit_*`, all `*_count`, `created_by`, `updated_by`, `duplicated_from_id`, eligibility JSON | PASS |
| Limits results to legitimately public & active promotions | `pg_get_viewdef` → `SELECT <public cols> FROM promotions WHERE status = 'active'` | PASS |
| Anonymous users cannot query the underlying `promotions` table | `SET ROLE anon; SELECT … FROM promotions` → **`42501 permission denied for table promotions`**; grants revoked | PASS |
| No unrestricted joins, functions, or hidden sensitive expressions | Single-table `FROM promotions`, **0 joins**; view function-dependency count = **0**; plain column projection only | PASS |
| Modification through the view is impossible | anon/authenticated have **no INSERT/UPDATE/DELETE** privilege on the view (only SELECT); base-table grants revoked | PASS |
| Recorded in Risk Register with rationale + review ownership | See §6 Risk Register entry `MKT-001A-SEC-EXC-01` | PASS |

**Why `security_invoker=false` is safe here.** The view runs with the definer's (owner's) rights *by design*, which is exactly how anon receives the safe projected columns of active rows **without any grant or RLS on the base `promotions` table**. Because public roles hold only `SELECT` on the view (no write privilege) and the view carries no joins/functions/computed sensitive expressions, definer rights cannot be leveraged to reach or mutate protected data. The residual is limited to the intended read of 36 public columns of active promotions.

---

## 5. What the operator must still do (RC2 → merge)

These are the exact outstanding steps. Each requires operator Vercel access and/or staging credentials that are unavailable to this verification environment.

1. **Configure `MARKETING_OAUTH_ENCRYPTION_KEY` on staging only.** Generate a high-entropy 64-char hex key; set it in Vercel scoped to the staging target (Preview / git branch `staging`, or the PR-branch preview if testing there). Add `MARKETING_OAUTH_ENCRYPTION_KEY_PREVIOUS` / legacy `SOCIAL_TOKEN_ENCRYPTION_KEY` **only if** existing staging OAuth rows must decrypt. Never place the value in git, logs, chat, PR, or these reports.
2. **Make the keyed PR-HEAD code reachable on the true staging target.** Either (a) scope the key + a Deployment-Protection bypass token to the PR-HEAD preview `dpl_EqHfwzMP…` (keeps PR #38 unmerged), or (b) push PR HEAD `86efe59c` onto the `staging` branch (feature→staging is within governance; still not `main`). Confirm the deployed SHA == `86efe59c` and that it points at Supabase `gbgnemlpyykyhpqqbgru`.
3. **Run the live matrix (gates 4–9, 12–14)** against the keyed, reachable staging URL with an authorized admin session and a provider test target: SSRF malicious `imageUrl` rejection + valid HTTPS image publish; XSS payload inert in-browser; existing-account decrypt + `v2` re-encrypt on reconnect; provider double-submit → one external post; public campaign page render; then scan staging logs for secret/token/payload patterns.
4. **Run the marketing UI smoke tests (gate 13).**
5. **Record exact evidence** (deployment SHA, URLs, HTTP results, screenshots, sanitized log scan) in this report.
6. **Confirm `MARKETING_OAUTH_ENCRYPTION_KEY` is present in production env *before* any production deploy** (fail-closed otherwise), as a separate production release gate.

---

## 6. Risk Register

| ID | Item | Severity | Release-blocking | Rationale | Owner / review |
|---|---|---|---|---|---|
| `MKT-001A-SEC-EXC-01` | `public_active_promotions` defined `security_invoker=false` (advisor `0010` ERROR) | Low | No | Documented exception: 36 public columns only, `WHERE status='active'`, no joins/functions, public roles hold SELECT only (no write), base table denied to anon/authenticated. Definer rights are the intended safe-projection mechanism. | Platform security; re-review at next marketing DB change or if columns/grants change. Optional future: convert to `security_invoker=true` + explicit column grants. |
| `MKT-001A-RC2-OPS-01` | Live E2E matrix + smoke + live log scan not executed | Med (process) | Yes for production GO; No for control correctness | Blocked by Deployment Protection + no keyed staging deploy from this environment. Controls verified at code + DB. | Marketing eng / DevOps |
| `MKT-001A-RC2-OPS-02` | `MARKETING_OAUTH_ENCRYPTION_KEY` not yet set on staging (or production) | Med (process) | Yes | Publishing/decryption fails closed without it. | DevOps |
| `MKT-001A-DNS-01` | DNS-rebinding window (Node re-resolves on connect) | Low–Med | No | Pre-resolution + per-redirect revalidation applied; custom undici dispatcher deferred. | Platform (later phase) |

---

## 7. Production non-impact (live-verified)

Production Supabase `tchayecuvzssixyxlvfu`: **0** MKT-001A migrations applied; `public_active_promotions` **absent**; `marketing_publish_idempotency` **absent**; `promotions` anon SELECT still `true` (the pre-existing exposure, deliberately untouched — it closes only when this PR reaches production under a separate release gate). Production Vercel remains `main@ad5b4ccb` (`dpl_EwbyVrZ5…`), not rebuilt by this phase. No production environment variable was added, changed, or read for its value.

---

## 8. Final authorization

**CONDITIONAL PASS.**

- **Merge:** PR #38 stays **open**; **do not merge** until the §5 operator steps produce live PASS evidence for gates 1, 4–9, 12–14 and this report is updated.
- **Production:** **NO-GO.** Even after merge authorization, production deployment requires a separate release gate confirming production env vars (esp. `MARKETING_OAUTH_ENCRYPTION_KEY` present before deploy), migration target, deployment mapping, recovery readiness, and post-release smoke-test ownership.
- **No failed security control.** Nothing in RC2 demonstrated a broken control that would force NO-GO; the shortfall is operational evidence, not a security regression.

## 9. Next authorized action

**Superseded by RC3.** The keyed PR-preview live verification was attempted in `docs/audits/marketing/MKT-001A-RC3-keyed-pr-preview-live-verification.md`.

RC3 outcome (2026-07-16T21:00Z): the Deployment-Protection blocker is **resolved** (temporary `_vercel_share` bypass created; PR-HEAD preview reachable) and the PR-HEAD SHA binding `86efe59c` is **confirmed**. However, RC3 directly tested the deployment→database binding and proved (via live runtime logs) that the PR-branch preview `dpl_EqHfwzMPHWGmvX1XabTvcb5XVfyT` carries **no backend env at all** — no Supabase URL/service-role/anon key and no `MARKETING_OAUTH_ENCRYPTION_KEY` — so it is **not** bound to `gbgnemlpyykyhpqqbgru` and the keyed live matrix cannot run on it. This refines RC2 gate 3's inference: the staging **database** is correct, but the **preview's wiring to it does not exist** on the PR-branch scope.

**Status remains CONDITIONAL PASS; PR #38 stays open; production NO-GO.** The remaining work is reclassified as an operations task — **OPS-001 — Preview Environment Configuration & Verification** (see `docs/audits/marketing/OPS-001-preview-environment-configuration-and-verification.md`): the operator must add Supabase (URL/anon/service-role for staging `gbgnemlpyykyhpqqbgru`) + `MARKETING_OAUTH_ENCRYPTION_KEY` to the PR-branch **Preview** scope only, redeploy PR HEAD `86efe59c`, confirm the runtime reports configuration present and reads `gbgnemlpyykyhpqqbgru` (not production `tchayecuvzssixyxlvfu`), then run the live matrix with an authorized admin session + provider target and record redacted evidence. On a clean live PASS, MKT-001A becomes **PASS** and PR #38 is authorized to merge into its approved base (`fix/r1.1-001-booking-date-fallback`), still subject to the separate production release gate.
