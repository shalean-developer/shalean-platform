# MKT-001A-RC — Staging Security Verification & Release-Candidate Report

**Program:** Marketing Platform Remediation
**Phase:** MKT-001A-RC (Release Candidate / Security Gate)
**Mode:** Controlled release verification — production untouched
**Source implementation:** `docs/audits/marketing/MKT-001A-security-hardening-implementation.md`
**Source audit:** `docs/audits/marketing/MKT-001-marketing-platform-engineering-audit.md`
**Date:** 2026-07-16

---

## 1. Executive decision

**CONDITIONAL PASS.**

All code, CI, and database-level security controls for the five Critical findings are committed, built successfully in linked CI, and verified. The two MKT-001A migrations were applied to the **positively-verified** staging Supabase project and the financial-access and idempotency controls were proven live against real staging data. The previously-blocked production build **now passes in CI** (workspace linking succeeds there).

The remaining items are **operational, operator-only prerequisites** that do not invalidate the security controls and cannot be executed from this environment:

1. Configure `MARKETING_OAUTH_ENCRYPTION_KEY` in **staging** Vercel (no Vercel env-var tooling available here).
2. Deploy the branch to the **staging** Vercel target and run the live HTTP/browser/provider matrix (SSRF via HTTP, XSS in-browser, encryption with a live OAuth account, idempotency against a provider/mock).

No production change was made. The PR is **not merged**.

---

## 2. Repository state

| Item | Value |
|---|---|
| Branch | `fix/mkt-001a-security-hardening` |
| Commit (HEAD) | `0a481c20062fa04edf99cb9ccde46f66b6d15a2a` |
| Base branch | `fix/r1.1-001-booking-date-fallback` @ `a818d674` (governance chain: feature → `staging` → `main`) |
| PR | https://github.com/shalean-developer/shalean-platform/pull/38 (base `fix/r1.1-001-booking-date-fallback`) |
| Files changed | 23 (10 modified, 13 added), +3076 / −130 |
| Working tree | Clean of tracked changes; remaining untracked entries are pre-existing unrelated audit/evidence artifacts (not MKT-001A) |
| Secret scan | GitGuardian CI check **PASS**; local grep matched only env-var *names* / a `"a".repeat(64)` test placeholder |
| Historical migrations | None edited; exactly two new MKT-001A migrations added |

Pre-commit scope was confirmed against the implementation report — every changed file maps to an MKT-001A workstream (WS1 SSRF, WS2 XSS, WS3 encryption, WS4 idempotency, WS5 financial access, WS6 coupled defects) plus its tests/docs.

---

## 3. CI and build results (PR #38)

| Gate | Result | Evidence |
|---|---|---|
| Install / workspace linking | **PASS** | `web-test` job "Install" step green — `@shalean/*` resolve in CI |
| Typecheck | **PASS** | `web-test` "Typecheck" step; local `tsc --noEmit` clean |
| Booking-core ESLint | **PASS** | `web-test` "Booking core ESLint gate" |
| Lint (changed files, local) | **PASS** | 0 errors, 1 pre-existing warning (`campaigns/[slug]/page.tsx:143` `Date.now`, not MKT-001A code) |
| Critical tests | **PASS** | `web-test` "Critical tests"; local `test:critical` 134/134 |
| Revenue-path tests | **PASS** | `web-test` "Revenue path tests" |
| Focused MKT-001A tests (local) | **PASS** | 62/62 — SSRF 23, XSS 12, encryption 11, idempotency 10, GBP 6 |
| Full test suite (local) | **PASS** | 3436/3436 (538 files) |
| Migration filename validation | **PASS** | CI `validate-migration-filenames`; local `db:migrations:validate` (14 files, 14 unique) |
| **Production build (Vercel)** | **PASS** | Deployment `dpl_4F6wVNuVTHpLn5JEayjxH5yYCnGt` READY — resolves the sole open item from the implementation report |
| GitGuardian security scan | **PASS** | No secrets detected |
| Supabase Preview | skipping | Points at prod integration but **skipped** — no production migration applied |
| `web-test` job overall | **RED (unrelated)** | Only failing step = "Live internal link crawl" (`validate:live-internal-links`) crawling live prod `https://shalean.co.za`, found 10 pre-existing `/locations/*` 404s |

**Live-crawl failure classification:** unrelated baseline/operational failure. It crawls production content (independent of this PR's diff), would fail identically on any branch, and touches nothing in MKT-001A scope (marketing promotions/social/security). Not an MKT-001A regression, not a workspace/CI-config defect in this PR. Out of scope to remediate here; flagged for the SEO/content owner.

Local build is environment-blocked (532 `Can't resolve '@shalean/*'` errors before any MKT-001A code — `apps/web/node_modules/@shalean/*` unpopulated locally). CI confirms the build is healthy once workspaces link.

---

## 4. Environment separation (identity verification)

Staging identity was **positively verified via live Supabase project metadata**, not memory. Note: the ref named in prior governance (`gfvdiczqyrvlmynvgegd`) **no longer exists** in the account — it is a deleted legacy ephemeral branch, exactly as this branch's own updated `.env.example` warns. The persistent staging project is `gbgnemlpyykyhpqqbgru` (literally named `shalean-platform-staging`).

| Layer | Staging | Production | Separation verified |
|---|---|---|---|
| Git branch | `fix/mkt-001a-security-hardening` (PR #38, unmerged) | `main` / `staging` | Yes |
| Vercel target | Preview `dpl_4F6…` (`target=null`), `shalean-platform-c8yxirwi8-…vercel.app` | Production (`shalean.co.za`, git-main alias) | Yes — preview URL only, not a prod domain |
| Supabase ref | `gbgnemlpyykyhpqqbgru` (shalean-platform-staging, eu-west-3) | `tchayecuvzssixyxlvfu` (shalean-platform, eu-west-3) | Yes — distinct refs |
| Supabase host | db.gbgnemlpyykyhpqqbgru.supabase.co | db.tchayecuvzssixyxlvfu.supabase.co | Yes |
| Encryption key scope | `MARKETING_OAUTH_ENCRYPTION_KEY` — **not yet configured** (operator) | unchanged | Pending operator |
| Provider credentials | separate, untouched | separate, untouched | Yes |

No command in this phase targeted the production ref. Production Vercel and env vars were not modified.

---

## 5. Staging database changes

Pre-apply snapshot (staging `gbgnemlpyykyhpqqbgru`): `anon`+`authenticated` held SELECT/INSERT/UPDATE/DELETE on `promotions`; unsafe policy `promotions_public_read_active` present; safe view and idempotency table absent; 1 promotions row. This confirms the vulnerability existed on staging.

Both migrations were applied with the **exact repo versions** recorded in `supabase_migrations.schema_migrations` (so the normal pipeline stays consistent later).

| Migration | Applied | Verification | Result |
|---|---:|---|---|
| `20260716180000_mkt_001a_promotions_financial_access` | Yes (v `20260716180000`, once) | anon/authenticated grants revoked (null); `promotions_public_read_active` dropped (null); `public_active_promotions` view created; sensitive columns absent | **PASS** |
| `20260716180100_mkt_001a_publish_idempotency` | Yes (v `20260716180100`, once) | `marketing_publish_idempotency` created; RLS enabled; service-role-only policy; unique index `(provider, idempotency_key)`; grantees = postgres/service_role only | **PASS** |

Migration count 12 → 14, no unexpected migrations. View column set contains only the 36 safe public fields; excludes `budget_zar`, `budget_spent_zar`, `revenue_generated_zar`, `usage_limit_*`, all `*_count`, `created_by`, `updated_by`, `duplicated_from_id`, eligibility JSON.

**Supabase security advisor (post-apply):** one MKT-001A finding — `public_active_promotions` flagged ERROR `security_definer_view` (lint 0010, https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view). **Accepted by design:** `security_invoker=false` is the intended mechanism that gives anon only the safe projected columns of active rows without any grant/RLS on the base table; the view exposes no sensitive data. Idempotency table produced no advisor findings. Remaining advisor items are pre-existing baseline (unrelated tables).

---

## 6. Security verification

| Finding | Test performed | Expected | Actual | Status |
|---|---|---|---|---|
| **SSRF** (WS1) | 23 unit tests: IPv4/IPv6 blocklists, https-only, embedded creds, localhost/private/link-local/metadata, DNS-resolves-to-private, redirect→private, excess redirects, timeout, oversized (length + streamed), wrong MIME, HTML/SVG-as-image, http_error, malformed | Unsafe rejected pre-fetch; valid https image accepted; safe typed errors; no secret/URL in logs | All 23 pass; central `fetchRemoteImageSafely` wired into FB path; GBP forward URL validated via `assertSafeHttpUrl` | **PASS (code)** — live HTTP replay = operator |
| **Stored XSS** (WS2) | 12 unit tests: `<script>`, `onerror/onclick`, `javascript:` (+mixed case), unsafe `data:`, iframe/object/embed/svg, style strip, safe-link rel/target, idempotent, null/empty | Malicious stripped; valid formatting retained; sanitize on write + render | All 12 pass; `sanitizeCampaignTermsHtml` applied in `createPromotion`/`updatePromotion` and on landing-page render | **PASS (code)** — in-browser confirm = operator |
| **Encryption** (WS3) | 11 unit tests: round-trip, unique ciphertext, tamper, wrong/missing key (fail-closed), previous-key + legacy-`v1` decrypt, migrate-to-current, **no `GOOGLE_CLIENT_SECRET` fallback**, plaintext passthrough | `v2:<keyId>` envelope; rotation via `_PREVIOUS`; legacy compat retained; fail-closed on missing key | All 11 pass | **PASS (code)** — live OAuth account decrypt/re-encrypt = operator |
| **Idempotency** (WS4) | 10 unit tests + **live staging DB**: duplicate `(provider, key)` → `23505` rejected; same key + other provider → allowed; anon SELECT on ledger → denied | DB is concurrency arbiter; duplicates blocked; ledger not anon-readable | Unit 10/10; DB: duplicate REJECTED (23505), provider-scoping ALLOWED, anon DENIED | **PASS (code + DB)** — provider double-click E2E = operator |
| **Financial access** (WS5) | **Live staging DB** as anon/authenticated/service_role | anon/authenticated denied on base table + financial fields + writes; safe view public-readable; service role retains access | anon: base DENIED, `budget_zar` DENIED, insert DENIED, ledger DENIED, safe view ALLOWED (public cols); authenticated: base DENIED; service_role: full | **PASS (live DB)** |

Findings D (DB layer) and E were verified **live against the real staging database**. Findings A, B, C are comprehensively covered by passing unit tests; their end-to-end HTTP/browser confirmation is the operator step in §11.

---

## 7. Functional smoke tests

Requires a live staging deployment carrying the new code (operator step). Regression risk is bounded by: full test suite 3436/3436, `test:critical` 134/134, typecheck PASS, and a successful CI production build. The migration is app-compatible with the currently-deployed staging code (promotions are read server-side via service role; revoking anon/authenticated grants does not affect the service-role path; idempotency table is additive).

| Workflow | Result |
|---|---|
| Marketing dashboard / Connected Accounts / GBP+FB status | Operator (live staging) |
| Campaign list / create-edit / public landing page | Operator (live staging); render-time sanitization covered by tests |
| Admin promotion financial reporting | Preserved — service-role reads unchanged (verified: service_role retains full access) |
| Social publishing history + safe media path | Operator (live staging + provider) |
| Booking / payment / auth / customer / cleaner / office | No files in those domains changed; full suite green |

---

## 8. Observability and secret review

- **Secret scan:** GitGuardian CI **PASS**; staged-diff grep found only env-var names + a test placeholder. No tokens/keys/authorization headers/private keys committed.
- **Structured events:** the code paths emit typed, redacted errors (safe media errors never echo the full URL; idempotency records key/hash + status; token errors are typed and never log token/key material) — verified by source review and unit tests.
- **Live log scan** for secret patterns on the running staging app requires the deployed new code + provider activity (operator step §11).
- **Token exposure:** encryption module never logs token/key values (unit-tested `no GOOGLE_CLIENT_SECRET fallback` + fail-closed).

---

## 9. Rollback and recovery (tabletop)

- **Application rollback:** revert to base `a818d674`. New code is backward-compatible with the new schema (extra table/view/revoked grants are inert to old code, which reads promotions via service role). Kill switch: unset provider publish env / disconnect GBP.
- **Database forward recovery:**
  - `marketing_publish_idempotency` — safely droppable; losing it loses only idempotency history (no business data).
  - `promotions` financial access — **must not** be casually reverted; restoring anon/authenticated grants or the dropped policy re-exposes the Critical anonymous financial-data leak. Correct a faulty public projection with a **forward** migration; `public_active_promotions` is safe to keep.
- **Encryption recovery:** after any `v2` re-encryption, the current key must remain configured; do not roll the app back after re-encryption without retaining the key (prefer forward fix / reconnect). Legacy `v1` + previous-key + legacy-key decryption paths are retained.
- **Publishing kill switch:** unset `FACEBOOK_PAGE_ACCESS_TOKEN` / disconnect GBP to disable publishing without a code change.

No vulnerability was intentionally reintroduced to "prove" rollback.

---

## 10. Remaining risks

| Risk | Severity | Release blocking | Owner | Next action |
|---|---|---:|---|---|
| Staging `MARKETING_OAUTH_ENCRYPTION_KEY` not yet set | Med (process) | Yes for live publish/decrypt | DevOps | Generate high-entropy key; set in staging Vercel only; add `_PREVIOUS` if migrating rows |
| Live HTTP/browser/provider matrix (A/B/C E2E) not executed | Med (process) | No (code+DB verified) | Marketing eng | Run on staging after deploy |
| `public_active_promotions` `security_definer_view` advisor (ERROR) | Low | No | Platform | Accept (by-design safe projection) or convert to invoker + column grants later |
| `security_invoker=false` view could be misread as risky | Low | No | Platform | Documented; column-restricted + active-only |
| DNS-rebinding window (Node re-resolves on connect) | Low–Med | No | Platform | Custom undici dispatcher with connect-time IP pinning (later phase) |
| `terms_html` historical rows sanitized at render, not in DB | Low | No | Marketing eng | Optional forward cleanup script |
| Live-crawl CI red (`/locations/*` 404 on prod) | Med (operational, unrelated) | No (not MKT-001A) | SEO/content | Fix production location hubs separately |
| Publish still synchronous (no queue) | Med | No | Marketing eng | MKT-001B (out of scope) |

---

## 11. Production prerequisites (operator, before production GO)

1. Configure `MARKETING_OAUTH_ENCRYPTION_KEY` in **staging** Vercel (scope: staging only); add `MARKETING_OAUTH_ENCRYPTION_KEY_PREVIOUS` / legacy `SOCIAL_TOKEN_ENCRYPTION_KEY` if existing rows must decrypt. Never place the value in git/logs/reports/PR.
2. Deploy the committed branch to the staging Vercel target; confirm the deployed commit == PR HEAD (`0a481c20`) and it points at staging Supabase (`gbgnemlpyykyhpqqbgru`), not production.
3. Execute the live matrix on staging: SSRF via `publish-facebook` with malicious `imageUrl`; XSS via a campaign with `<script>`/`onerror` payloads confirmed inert in-browser; encryption decrypt of an existing account + `v2` write on reconnect; idempotency double-submit → one external post.
4. Scan staging logs for secret patterns post-run.
5. Confirm `MARKETING_OAUTH_ENCRYPTION_KEY` is present in **production** env *before* any production deploy (fail-closed otherwise).
6. Obtain explicit authorization; then merge and deploy per governance (feature → staging → main).

---

## 12. Final MKT-001A readiness

- **Implementation:** complete (five Critical findings remediated at code + DB).
- **CI:** production build + all code gates green; one unrelated live-crawl step red.
- **Staging DB:** both migrations applied and verified; financial-access + idempotency proven live.
- **Staging app + live matrix:** pending operator (secret + deploy + E2E).
- **Production:** untouched.
- **Score:** Marketing Security sub-score 40 → **68/100** (unchanged from implementation; RC evidence corroborates). Overall platform readiness ~52/100 (feature/reliability gaps persist).

---

## 13. GO / NO-GO

**CONDITIONAL PASS — GO for merge-preparation after the operator prerequisites in §11 are satisfied on staging.**

- Do **not** merge PR #38 until the live staging matrix passes and explicit authorization is received.
- Do **not** deploy production.
- No Critical/High release-blocking regression remains in MKT-001A scope; the one red CI check is an unrelated production-content live-crawl.

## 14. Next authorized action

Operator: configure `MARKETING_OAUTH_ENCRYPTION_KEY` in staging Vercel and deploy `fix/mkt-001a-security-hardening` (`0a481c20`) to the staging target, then run the §11 live security matrix and report results back for the final merge authorization.
