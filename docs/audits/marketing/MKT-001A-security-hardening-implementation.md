# MKT-001A — Security Hardening Implementation & Verification Report

**Program:** Marketing Platform Remediation
**Phase:** MKT-001A (Blocker / Controlled remediation)
**Source audit:** `docs/audits/marketing/MKT-001-marketing-platform-engineering-audit.md`
**Branch:** `fix/mkt-001a-security-hardening`
**Base:** `fix/r1.1-001-booking-date-fallback` @ `a818d674` (`fix(booking): remove legacy bookings.booking_date fallback (R1.1-001)`)
**Status:** Implemented, tested, verified. **Not merged, not deployed.**

---

## 1. Executive decision

**CONDITIONAL PASS.**

All five Critical findings are remediated at the code and database-migration level, with automated regression coverage. `typecheck`, `lint` (0 errors), the full test suite (3436 tests), the critical suite (134 tests), and migration validation all pass. The only gate not confirmable in this workspace is the Next.js production **build**, which fails **before reaching any MKT-001A code** because the monorepo workspace packages (`@shalean/*`) are not linked in this environment's `node_modules` (532 `Can't resolve '@shalean/...'` errors, none in changed files). This is a pre-existing environment plumbing issue and must be re-confirmed in properly-linked CI before deployment.

No code has been deployed. Deployment requires the encryption-key prerequisite (below) and staging verification.

---

## 2. Scope completed

| Workstream | Result | Evidence |
|---|---|---|
| WS1 — SSRF prevention | Done | `lib/security/safeRemoteMedia.ts` + wired into FB/GBP paths; 23 tests |
| WS2 — Stored XSS | Done | `lib/promotions/campaignTermsHtml.ts` + sanitize on write & render; 12 tests |
| WS3 — Encryption key management | Done | `lib/security/tokenEncryption.ts` keyring/`v2` envelope; 11 + 2 tests; runbook + script |
| WS4 — Publish idempotency | Done | `marketing_publish_idempotency` migration + `lib/promotions/publishIdempotency.ts`; 10 tests |
| WS5 — Financial-data access control | Done | `20260716180000_*` migration (revoke grants, drop policy, safe view) |
| WS6 — Coupled defects | Done (bounded) | Facebook `social_publish_history` writes unified; GBP forward-URL validated |

Non-goals (queues, scheduling, provider expansion, UI redesign, multi-tenant) were **not** touched.

---

## 3. Repository state

- **Branch:** `fix/mkt-001a-security-hardening`
- **Base commit:** `a818d674`
- **Working tree at start:** clean (tracked); untracked unrelated audit evidence only — no overlap with MKT-001A source.
- **Commits:** none created (per instructions: stop before merge/deploy; changes remain uncommitted on the branch).

---

## 4. Audit evidence confirmed (validated at HEAD `a818d674`)

| Finding | Audit path | Confirmed | Exploit / failure path |
|---|---|---|---|
| SSRF | `lib/promotions/facebookPublish.ts:298–311` | Yes — `fetch(imageUrl,{redirect:"follow"})`, no validation | Admin `imageUrl` → server fetch of `169.254.169.254`/loopback/private |
| Stored XSS | `app/(marketing)/campaigns/[slug]/page.tsx:277–285` | Yes — `dangerouslySetInnerHTML` unsanitized | `terms_html` script executes on public page |
| Encryption-key coupling | `lib/security/tokenEncryption.ts:13–30` | Yes — `sha256("shalean-social:"+GOOGLE_CLIENT_SECRET)` fallback, no key id | Rotating OAuth secret bricks tokens |
| Missing idempotency | both publish routes | Yes — no server-side dedupe | Double-click / retry → duplicate external posts |
| Financial-data exposure | baseline `15395` (policy) + `17435` (`GRANT ALL … anon`) | Yes — anon `select=*` on active promotions | `GET /rest/v1/promotions?status=eq.active&select=*` leaks `budget_zar`, `revenue_generated_zar`, … |

Note: `campaign_content/assets/templates` were already locked down by phase-1.11c, so only `promotions` remained exposed.

---

## 5. Files changed

**Modified (tracked):**
- `apps/web/lib/promotions/facebookPublish.ts` — SSRF-safe media download.
- `apps/web/lib/google-business.ts` — validate forwarded image URL; lazy token re-encryption.
- `apps/web/lib/security/tokenEncryption.ts` — independent versioned keyring (`v2`), no Google fallback.
- `apps/web/lib/promotions/server.ts` — sanitize `terms_html` on create/update.
- `apps/web/app/(marketing)/campaigns/[slug]/page.tsx` — sanitize `terms_html` on render.
- `apps/web/app/api/admin/promotions/publish-facebook/route.ts` — idempotency + unified `social_publish_history`.
- `apps/web/app/api/admin/promotions/publish-google-business/route.ts` — idempotency.
- `apps/web/lib/promotions/__tests__/googleBusinessPublish.test.ts` — updated `v1`→`v2` envelope assertion.
- `apps/web/.env.example`, `docs/CAMPAIGN_SOCIAL_PUBLISHING.md` — key documentation.

**New:**
- `apps/web/lib/security/safeRemoteMedia.ts` (+ test)
- `apps/web/lib/promotions/campaignTermsHtml.ts` (+ test)
- `apps/web/lib/promotions/publishIdempotency.ts` (+ test)
- `apps/web/lib/security/__tests__/tokenEncryption.test.ts`
- `apps/web/scripts/reencrypt-social-tokens.mjs`
- `supabase/migrations/20260716180000_mkt_001a_promotions_financial_access.sql`
- `supabase/migrations/20260716180100_mkt_001a_publish_idempotency.sql`
- `docs/runbooks/social-token-encryption-key-rotation.md`

---

## 6. Database migrations added

| Migration | Purpose | Validation |
|---|---|---|
| `20260716180000_mkt_001a_promotions_financial_access.sql` | Revoke anon/authenticated grants on `promotions`; drop `promotions_public_read_active`; add `public_active_promotions` safe projection view | `db:migrations:validate` PASS |
| `20260716180100_mkt_001a_publish_idempotency.sql` | `marketing_publish_idempotency` ledger, `UNIQUE(provider, idempotency_key)`, RLS service-role-only | `db:migrations:validate` PASS |

Both are forward-only, idempotent (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`), and do not modify historical migrations. Not applied to any environment.

---

## 7. Security design decisions

- **Central SSRF fetcher, not per-call checks.** One server-only module validates URL shape, resolves DNS, blocks the full private/loopback/link-local/ULA/multicast/reserved/metadata IP space (v4 + v6, incl. IPv4-mapped), revalidates every redirect hop, caps time + size, and enforces an image MIME allowlist.
- **HTTPS-only.** No documented provider need for plaintext; simplifies the trust model.
- **Sanitize twice (write + render).** Covers pre-remediation rows and template-generated `structured.terms`.
- **Key independence + versioning.** `v2:<keyId>` envelope enables rotation; `GOOGLE_CLIENT_SECRET` fallback removed; missing key fails closed with a typed error.
- **DB-enforced idempotency.** The `UNIQUE` constraint is the concurrency arbiter (insert-first claim), not the client button.
- **Deny-by-default financial data.** App reads promotions server-side via service role only; anon/authenticated DB grants revoked; a column-restricted view provides a safe future path.

---

## 8. SSRF remediation

`fetchRemoteImageSafely()` (`apps/web/lib/security/safeRemoteMedia.ts`):
- `https:` only; rejects embedded credentials and malformed URLs.
- Rejects literal blocked-IP hosts and `localhost`/`.internal`/`.local` hostnames synchronously (`assertSafeHttpUrl`).
- Resolves DNS and rejects if **any** returned A/AAAA record is blocked (`assertResolvedHostAllowed`); `isBlockedIp` covers IPv4 (`0/8,10/8,100.64/10,127/8,169.254/16,172.16/12,192.168/16,192.0.0/24,198.18/15,TEST-NETs,224/4,240/4`) and IPv6 (`::1,::,fc00::/7,fe80::/10,ff00::/8,2001:db8::/32`, IPv4-mapped).
- `redirect:"manual"` with each hop re-validated; capped redirect count.
- AbortController timeout (8s); streamed read with hard byte cap (8 MB), plus `content-length` pre-check.
- Content-type must be an allowlisted image (`png/jpeg/webp/gif`); HTML/SVG/XML/other rejected.
- No cookies/Authorization forwarded; errors typed; logs never include the full URL.

Wired into `publishFacebookPagePhotoFromUrl` (server fetch → re-upload). Google Business forwards a `sourceUrl` that **Google** fetches, so `ensurePublicImageUrlForGooglePost` now validates it with `assertSafeHttpUrl` before forwarding.

**DNS-rebinding residual:** pre-resolution + per-redirect revalidation is applied; Node re-resolves on connect, leaving a small window. Documented as an accepted residual (no custom undici dispatcher introduced this phase) — Risk Register item below.

---

## 9. XSS remediation

`sanitizeCampaignTermsHtml()` (`apps/web/lib/promotions/campaignTermsHtml.ts`) uses `sanitize-html` (already a dependency).

**Allowlist:** tags `p, br, strong, b, em, i, u, ul, ol, li, a, span`; attributes `a[href,rel,target]`, `span[class]`, `p[class]`; schemes `http, https, mailto, tel`; **all styles disallowed**. External links forced to `rel="nofollow noopener noreferrer" target="_blank"`.

**Rejected:** `script`, inline event handlers, `iframe/object/embed`, SVG, forms, `style`, `javascript:`/unsafe `data:` (incl. mixed-case).

Applied on **write** (`createPromotion`/`updatePromotion` in `server.ts`) and on **render** (landing page), covering historical rows and `structured.terms`.

**Historical data:** existing `terms_html` is sanitized at render immediately (no data change needed). A forward migration is intentionally **not** included because render-time sanitization fully neutralizes stored payloads; a one-off cleanup script can be added later if canonical storage is desired (recorded as tech debt).

---

## 10. Encryption & rotation design

`apps/web/lib/security/tokenEncryption.ts`:
- **Algorithm:** AES-256-GCM, random 12-byte IV, auth tag.
- **Envelope:** `v2:<keyId>:<iv>:<tag>:<ct>`; `keyId = sha256(key)[0:8]` (non-secret).
- **Key sources (priority):** `MARKETING_OAUTH_ENCRYPTION_KEY` → legacy `SOCIAL_TOKEN_ENCRYPTION_KEY` for current; `_PREVIOUS` + legacy for decrypt. **`GOOGLE_CLIENT_SECRET` removed.**
- **Decrypt:** `v2` by matching key id (falls back to trying the ring); legacy `v1` by trying all ring keys; typed `TokenDecryptionError`/`TokenEncryptionConfigError`.
- **Re-encryption:** lazy (`maybeReEncryptStoredTokens` on valid-token read) + controlled script `scripts/reencrypt-social-tokens.mjs` (`--apply`, dry-run counts, never prints tokens).
- **Runbook:** `docs/runbooks/social-token-encryption-key-rotation.md` (rotation, first-time-from-legacy, recovery, validation).

---

## 11. Idempotency design

Table `marketing_publish_idempotency` with `UNIQUE(provider, idempotency_key)`; states `processing → succeeded | failed`.

`claimPublish()` (`apps/web/lib/promotions/publishIdempotency.ts`):
- Key = client `Idempotency-Key` header (deliberate reposts) else a stable `sha256` of `{provider,target,promotionId,message,link}` (dedupes double-clicks/retries of identical content).
- Insert-first claim; on `23505` inspects the existing row → `duplicate_succeeded` (replay original external id), `in_progress` (409), `conflict` (same key, different payload → 409), or atomic `retry` (failed → re-claimed).
- Success/failure recorded with the external post id via `markPublishSucceeded/Failed`.
- Both publish routes claim **before** the provider call (GBP claims before media upload to avoid orphan uploads).

**Transaction/failure matrix handled:** DB-created-then-provider-fail (row `failed`, retryable); provider-success-then-DB-fail (best-effort mark; replay dedupes); client timeout with provider success (subsequent request replays); concurrent duplicate (unique constraint → in_progress); same key different payload (conflict); ambiguous provider response (recorded, retry policy); deliberate repeat (new `Idempotency-Key`).

---

## 12. RLS & financial-data remediation

`20260716180000_mkt_001a_promotions_financial_access.sql`:
- `REVOKE ALL ON public.promotions FROM anon, authenticated` (service_role retained).
- `DROP POLICY promotions_public_read_active`.
- `CREATE VIEW public.public_active_promotions WITH (security_invoker=false)` exposing only non-sensitive columns for `status='active'`; `GRANT SELECT` to anon/authenticated.

**Excluded from the view:** `budget_zar, budget_spent_zar, revenue_generated_zar, usage_limit_total, usage_limit_per_customer, views_count, clicks_count, bookings_started_count, bookings_completed_count, redemptions_count, created_by, updated_by, duplicated_from_id, customer_eligibility, booking_eligibility`.

App impact: none. `/api/promotions` and `/api/account/rewards` already return explicit DTOs without financial fields; the landing page renders server-side via service role. No browser code queries `promotions` directly.

---

## 13. Tests added

| Suite | Tests | Coverage |
|---|---|---|
| `lib/security/__tests__/safeRemoteMedia.test.ts` | 23 | IPv4/IPv6 blocklists, URL shape, https-only, credentials, localhost/private/metadata, DNS-resolves-to-private, redirect→private, excess redirects, timeout, oversized (length + streamed), wrong MIME, HTML-as-image, SVG, http_error, malformed |
| `lib/promotions/__tests__/campaignTermsHtml.test.ts` | 12 | normal terms, `<script>`, onerror/onclick, `javascript:` (+mixed case), unsafe `data:`, safe link rel/target, iframe/object/embed/svg, style strip, malformed, idempotent, null/empty |
| `lib/security/__tests__/tokenEncryption.test.ts` | 11 | round trip, unique ciphertext, tamper, wrong/missing key, previous-key + legacy-v1 decrypt, migrate-to-current, malformed, **no GOOGLE_CLIENT_SECRET fallback**, plaintext passthrough |
| `lib/promotions/__tests__/publishIdempotency.test.ts` | 10 | claimed, in_progress (concurrent), replay, retry after fail, conflict, provider/target scoping, deliberate new key, success/failure recording |
| `lib/promotions/__tests__/googleBusinessPublish.test.ts` | 6 (updated) | `v2` envelope round trip + plaintext passthrough |

New MKT-001A tests: **64**, all passing.

---

## 14. Validation results

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` (`apps/web`) | **PASS** (~30s) |
| Lint | `eslint` on all changed files | **PASS** — 0 errors, 1 pre-existing warning (`page.tsx:143` `Date.now` in `offerExpired`, not MKT-001A code) |
| Focused suites | `vitest run` (6 MKT files) | **PASS** — 64/64 |
| Critical suite | `npm run test:critical` | **PASS** — 134/134 (17 files) |
| Full suite | `npm test` | **PASS** — 3436/3436 (538 files), ~59s |
| Migrations | `npm run db:migrations:validate` | **PASS** — 14 files, 14 unique timestamps |
| Build | `npm run build` (`apps/web`) | **BLOCKED (environment)** — 532 `Can't resolve '@shalean/*'` workspace-linking errors before any MKT-001A code; `node_modules/@shalean` unpopulated in this workspace. Typecheck (which build re-runs) passes. Must re-run in linked CI. |

No tests were skipped.

---

## 15. Manual verification results

Automated regression tests stand in for manual checks in this workspace (no running dev/staging environment or live provider credentials available here). Documented fixtures for staging:

- **SSRF:** POST `publish-facebook` with `imageUrl=http://169.254.169.254/…`, `https://127.0.0.1/x.png`, `https://<host-resolving-to-10.x>` → each returns a safe `blocked_host`/`insecure_scheme` message; a valid public CDN https image publishes. (Covered by `safeRemoteMedia.test.ts`.)
- **XSS:** create a promotion with `terms_html='<img src=x onerror=alert(1)><script>alert(1)</script>'`; open `/campaigns/<slug>` → renders inert text, no script. (Covered by `campaignTermsHtml.test.ts`.)
- **Encryption:** with `MARKETING_OAUTH_ENCRYPTION_KEY` set and `_PREVIOUS` = old key, an existing connected account reads/refreshes without exposing tokens; rows migrate to `v2:<currentKeyId>`. (Covered by `tokenEncryption.test.ts` + runbook.)
- **Idempotency:** double-submit identical publish → one `succeeded` ledger row + one external post; second returns `idempotentReplay`. (Covered by `publishIdempotency.test.ts`.)
- **Financial access:** after migration, `GET /rest/v1/promotions?...&select=budget_zar` with the anon key is denied; `public_active_promotions` returns only public columns; landing pages and admin reporting still work.

Staging owner must execute the live matrix before production sign-off.

---

## 16. Remaining risks

| Risk | Severity | Owner | Next phase |
|---|---|---|---|
| DNS rebinding window (Node re-resolves on connect) | Low–Med | Platform | Custom undici dispatcher with connect-time IP pinning |
| `terms_html` stored unsanitized historically (neutralized at render, not in DB) | Low | Marketing eng | Optional forward cleanup script; canonical sanitized storage |
| Content-hash idempotency blocks deliberate identical repost without `Idempotency-Key` header | Low | Marketing eng | UI "post again" affordance that sends a fresh key |
| Legacy plaintext token passthrough retained for backward compat | Low | Platform | Remove passthrough after confirming no plaintext rows |
| Build not verified locally (workspace linking) | Med (process) | DevOps | Re-run build in linked CI before deploy |
| Publish still synchronous (no queue/retry) | Med | Marketing eng | MKT-001B durable publish pipeline (out of scope) |

---

## 17. Rollback plan

**Application:**
- Revert the branch to base `a818d674`. New code is backward compatible with the new schema (extra table/view/grants are inert without the code).
- Kill switch: unset provider publish env (`FACEBOOK_PAGE_ACCESS_TOKEN`, disconnect GBP) to disable publishing.
- Token compatibility: reverted code reads `v1` again; **but** any tokens re-encrypted to `v2` will NOT decrypt on old code. **Do not roll application back after re-encryption without keeping the key** — prefer forward fix or reconnect.

**Database (prefer forward remediation):**
- `20260716180100` (idempotency): reversible by dropping the table; rolling back loses idempotency history (acceptable — no business data).
- `20260716180000` (financial access): the revoke/drop-policy can be restored, but doing so **reintroduces the Critical anon exposure** — only under an explicit emergency exception. The `public_active_promotions` view is safe to keep.
- Never revert grants/policies in a way that re-exposes financial columns without sign-off.
- After new `v2` ciphertext is written, the current key must remain configured.

---

## 18. Deployment prerequisites

**Before staging:**
- Clean working tree; migrations reviewed; targeted tests passing; full suite status recorded (above).
- `MARKETING_OAUTH_ENCRYPTION_KEY` configured (staging); `_PREVIOUS`/legacy set if migrating existing rows.
- Rotation procedure approved; safe admin test account + provider test target available.
- Rollback reviewed; **build re-run and passing in linked CI**.

**Before production:**
- Staging verification of all five findings; authorized approval.
- Env var mapping confirmed (`MARKETING_OAUTH_ENCRYPTION_KEY` present in production **before** deploy, else publishing/decryption fails closed).
- DB target identity confirmed; backup/recovery per governance; smoke-test owner + post-release monitoring identified.
- No unresolved Critical findings.

---

## 19. Verification checklist

- [x] SSRF fetcher validates DNS, IP (v4+v6), redirects, size, timeout, MIME.
- [x] `terms_html` sanitized with a documented allowlist (write + render).
- [x] OAuth encryption uses an independent, versioned key; no `GOOGLE_CLIENT_SECRET` fallback.
- [x] Existing encrypted data has a safe transition (previous-key + lazy/scripted re-encryption).
- [x] Publish operations idempotent at server + database (unique constraint).
- [x] Anonymous/unauthorized cannot read promotion financial fields (grants revoked, policy dropped, safe view).
- [x] Authorized admin workflows preserved (service-role reads unchanged).
- [x] Public campaign pages preserved (server-side render, sanitized terms).
- [x] Automated regression coverage added (64 tests).
- [x] Migrations validate; typecheck passes; required lint passes (0 errors); focused + full tests pass.
- [ ] Build passes — **blocked by environment workspace linking; re-run in CI.**
- [x] Documentation updated (env, OAuth doc, runbook, this report).
- [x] Rollback + deployment plans documented.
- [ ] Deployed — **no; awaiting explicit authorization.**

---

## 20. Final production-readiness score

Marketing Platform **Security** sub-score (MKT-001 §14): **40 → 68 / 100** after MKT-001A.
- SSRF, XSS, key coupling, idempotency, and anon financial exposure closed.
- Residual gaps (DNS-rebinding hardening, rate limiting, webhook signatures, durable publish pipeline) remain for later phases; they cap the score below target.

Overall Marketing Platform readiness: **44 → ~52 / 100** (security is one weighted dimension; feature/reliability gaps from MKT-001 persist). **Target for platform GA: 75+.**

---

## Remediation evidence table

| Finding | Severity | Root cause | Remediation | Regression test | Verification | Status |
|---|---|---|---|---|---|---|
| SSRF | Critical | Unvalidated server fetch of admin `imageUrl` with `redirect:"follow"` | Central `safeRemoteMedia` (https, DNS+IP block, redirect revalidation, size/type caps); validate GBP forward URL | `safeRemoteMedia.test.ts` (23) | Blocked-host/scheme/redirect/size/MIME cases pass | **Remediated** |
| Stored XSS | Critical | `terms_html` rendered via `dangerouslySetInnerHTML` unsanitized | `sanitize-html` allowlist on write + render | `campaignTermsHtml.test.ts` (12) | script/handler/js-url/svg stripped | **Remediated** |
| Encryption-key coupling | Critical | Key derived from `GOOGLE_CLIENT_SECRET`, no versioning | Independent `v2` keyring, rotation, lazy/scripted re-encrypt, no Google fallback | `tokenEncryption.test.ts` (11) | rotation/previous/legacy decrypt; no-fallback | **Remediated** |
| Missing publish idempotency | Critical | No server dedupe | `marketing_publish_idempotency` unique claim + state machine, both routes | `publishIdempotency.test.ts` (10) | concurrent/replay/retry/conflict | **Remediated** |
| Financial-data exposure | Critical | `GRANT ALL … anon` + `promotions_public_read_active` | Revoke grants, drop policy, safe projection view | Migration + `db:migrations:validate` | anon `select=*` denied; view public-only | **Remediated (DB migration, apply in staging)** |

---

## Non-goals recorded for later phases

Durable publish queue/scheduler/retry/DLQ, provider adapter architecture, Instagram/LinkedIn/Pinterest/X, media library, email campaign sending, provider analytics, campaign redesign, multi-tenant provider accounts, API rate limiting, webhook signature validation. Tracked to MKT-001B+ / Risk & Technical Debt registers in MKT-001.
