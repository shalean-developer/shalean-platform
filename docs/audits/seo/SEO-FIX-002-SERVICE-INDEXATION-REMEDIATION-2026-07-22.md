# SEO-FIX-002 — Service Indexation Remediation (2026-07-22)

| Field | Value |
|-------|-------|
| Document ID | `SEO-FIX-002-SERVICE-INDEXATION-REMEDIATION-2026-07-22` |
| Date | 2026-07-22 |
| Authority | **Provisional** — user-authorised repository-only remediation; formal EO instruments **not verified** |
| Companion map | `SEO-FIX-001-URL-DISPOSITION-MAP-2026-07-22` |
| Production / GSC / deploy authority | **NONE** |

---

## 1. Objective

Repository-only remediation for five core service URLs reported **not indexed** in Google Search Console (evidence date 22 July 2026), while Standard Cleaning and Carpet Cleaning remain indexed:

* `/services/deep-cleaning-cape-town`
* `/services/airbnb-cleaning-cape-town`
* `/services/office-cleaning-cape-town`
* `/services/move-out-cleaning-cape-town`
* `/services/window-cleaning-cape-town`

---

## 2. Baseline diagnosis (repo)

### 2.1 Shared technical baseline (all five)

| Check | Baseline finding |
|-------|------------------|
| Route | `app/services/[service]/page.tsx` → `SeoCapeTownServicePage` |
| HTTP | Expected **200** (not in `isSeoRebuildGonePath` at phase 2) |
| Robots meta | `SEO_INDEX_FOLLOW` via `buildCapeTownServiceMetadata` |
| Canonical | Self-referencing `https://shalean.co.za/services/...` |
| Sitemap | Present in `SEO_REBUILD_SITEMAP_CORE_PATHS` + `buildMarketingSitemapEntries` |
| Structured data | LocalBusiness + CleaningService + FAQPage on template |
| Breadcrumbs | Present |
| Booking CTA | `/book` |

**Conclusion:** Non-indexation is **not** explained by robots Disallow, missing sitemap rows, wrong host canonicals, or hard 410s (except historical window-cleaning phase-1 410 — now restored).

### 2.2 Probable root causes (per URL)

| URL | Probable root cause | Supporting evidence |
|-----|---------------------|---------------------|
| `/services/window-cleaning-cape-town` | **Historical removal signal + weak discovery** | Phase-1 rebuild treated path as 410; restored only at `SEO_REBUILD_PHASE = 2`. Absent from homepage `ServicesSection` and header nav before this package. |
| `/services/office-cleaning-cape-town` | **Weaker differentiation + thin internal prominence** | No neighbourhood guides; keyword-stuffed explanatory paragraph; missing from homepage cards; commercial-intent block was generic. |
| `/services/deep-cleaning-cape-town` | **Quality / intent competition despite presence** | Linked from homepage + nav, but overlapped Stage-19 / blog / location intent surfaces; missing explicit exclusions; benefit copy referenced Airbnb turnovers loosely. Not a crawl-block issue. |
| `/services/airbnb-cleaning-cape-town` | **SERP residue from retired area URLs + overclaim risk** | Area landings `/services/airbnb-cleaning-{sea-point\|green-point\|claremont}` are **410**. Same-day language read as near-guarantee. Missing from header nav. |
| `/services/move-out-cleaning-cape-town` | **Claim / trust friction on otherwise complete page** | FAQ claimed “from R980” and soft deposit-return framing without clear non-guarantee. Marketing hyperbole in intro (“spotless”, “perfect condition”). |

Indexed contrast: Standard and Carpet already had stronger CTR title treatment / homepage presence / cleaner commercial framing — consistent with discovery + quality asymmetry rather than sitemap omission.

---

## 3. Changes implemented (repository-only)

### 3.1 Content / metadata (five money pages)

In `lib/seo/capeTownSeoPages.ts`:

* Added `exclusions[]` to service SEO block type and populated for all five remediation slugs (“What’s not included”).
* Office: neighbourhood hub guides; removed keyword stuffing; clearer small-office scope.
* Airbnb: tightened turnover copy; softened same-day language; explicit exclusions.
* Move-out: neutral inspection-oriented copy; pricing FAQ aligned to indicative ~R800 / live checkout; explicit **no deposit-return guarantee**.
* Window: neighbourhood guides; exclusions; additional FAQ.
* Deep: exclusions; softened Airbnb-turnover benefit wording.

### 3.2 Template

* `SeoCapeTownServicePage.tsx` — render exclusions section when present.
* `ServicePageCommercialIntentSection.tsx` — stronger cross-links for office / window / Airbnb.

### 3.3 Internal links

* `marketingServiceNavLinks.ts` — header nav now lists all seven money pages + hub.
* `ServicesSection.tsx` — homepage cards for Office and Window (link-only; no invented widget prices).
  * **Codex P2 correction:** Window Cleaning card is **informational only** (`bookCta: false`) — no `Book Now`, no `/book` / `/quote` / `/contact` action. Booking-v2 does not offer window cleaning; do not route customers into an unsupported flow.
* `ServicePageCommercialIntentSection.tsx` — for `window-cleaning-cape-town`, removed the shared “book online” `/book` CTA (kept service-to-service informational cross-links only).

### 3.4 Tests

* `lib/seo/__tests__/seoFix001002ServiceRemediation.test.ts` — canonical host, metadata, uniqueness/exclusions, sitemap inclusion/exclusions, nav targets, **homepage Window Cleaning no-CTA guard**, location disposition, `/details` → `/book`, cleaner form noindex.

### 3.5 Explicitly not changed

* Redirect maps / proxy edge behaviour (already aligned to `/locations/` spine).
* `/cleaner/apply/form` noindex (preserved).
* `/booking/details` noindex (preserved; recommended remain `NOINDEX`).
* Window Cleaning **service page** and **nav link** retained.
* Window Cleaning **not** added to booking-v2.
* No contact / quotation workaround CTA for Window Cleaning on the homepage.
* Shared “4,500+ Homes Cleaned” overlay — **flagged for verification**, not removed (affects indexed pages too).
* Production, DNS, GSC, sitemap submission, indexing requests.

---

## 4. Evidence appendix

### 4.0 Production package tip (PR #89)

| Item | Value |
|------|-------|
| PR | https://github.com/shalean-developer/shalean-platform/pull/89 |
| Branch | `seo/fix-001-002-prod-ready` |
| Code tip (Window Cleaning CTA removal) | `6e6a1429225a0513e0bb58ba688247e367104ab5` |
| EO package tip (verify CI / preview against this SHA) | `0ecc6086f8a51e39336ed6e540c21b69b281dfb2` |
| Codex P2 (Window Cleaning homepage Book Now → unsupported booking-v2) | **Resolved** by removing the CTA entirely (informational card only); no quote/contact workaround; window not added to booking-v2 |

### 4.1 Baseline (pre-change, repository)

| Item | Result |
|------|--------|
| Branch | `docs/seo-p1a-option-b-baseline` (unrelated untracked SEO docs preserved) |
| Formal EO remediation auth | **Not present** — work labelled provisional |
| Five URLs in core sitemap | Yes |
| Five URLs gone-path | No (window false at phase 2) |
| Canonical host | `https://shalean.co.za` |
| GSC user-supplied | 5 not indexed; Standard + Carpet indexed; `/services` group 862 impressions / 2 clicks |

### 4.2 Post-change verification (local)

| Command | Result |
|---------|--------|
| `npx vitest run lib/seo/__tests__/seoFix001002ServiceRemediation.test.ts` | **Passed** — 12 tests (includes homepage Window Cleaning no-CTA guard) |
| `npx vitest run lib/seo/__tests__ lib/site` | **Passed** — 17 files, 94 tests |
| `NODE_OPTIONS=--max-old-space-size=8192 npm run typecheck` | **Passed** |
| `npm run build` (Next.js production-equivalent) | **Passed** |
| Live HTTP / GSC URL Inspection | **Not run** — unauthorised / out of scope |
| Playwright SEO e2e | **Not run** — none dedicated |

Classification:

* **Passed:** FIX remediation Vitest + `lib/seo`/`lib/site` suite + typecheck + production build; homepage Window Cleaning card has no Book Now / `/book` / `/quote` / `/contact` CTA
* **Failed because of this change:** none observed
* **Pre-existing:** Supabase env warnings during sitemap tests (non-fatal; file-based union still builds)
* **Not run:** live crawl, GSC
* **Blocked:** production merge/deploy, indexing requests
* **Codex P2:** resolved by removing Window Cleaning booking CTA (informational card only)

---

## 5. Files changed

| Path | Change |
|------|--------|
| `docs/audits/seo/SEO-FIX-001-URL-DISPOSITION-MAP-2026-07-22.md` | Added |
| `docs/audits/seo/SEO-FIX-001-URL-DISPOSITION-MAP-2026-07-22.csv` | Added |
| `docs/audits/seo/SEO-FIX-002-SERVICE-INDEXATION-REMEDIATION-2026-07-22.md` | Added (this file) |
| `apps/web/lib/seo/capeTownSeoPages.ts` | Exclusions + content remediation |
| `apps/web/components/seo/SeoCapeTownServicePage.tsx` | Exclusions UI |
| `apps/web/components/seo/ServicePageCommercialIntentSection.tsx` | Cross-link copy; window slug omits `/book` CTA |
| `apps/web/lib/marketing/marketingServiceNavLinks.ts` | Full service nav |
| `apps/web/components/home/sections/ServicesSection.tsx` | Office + Window cards; Window `bookCta: false` (informational only) |
| `apps/web/lib/seo/__tests__/seoFix001002ServiceRemediation.test.ts` | Added + Window Cleaning no-CTA guard |

---

## 6. Production validation checklist (unauthorised until approved)

1. Deploy preview / staging with this package.
2. Confirm HTTP 200 + `index,follow` + self canonical on all five URLs.
3. Confirm `/sitemap.xml` lists all five apex URLs; excludes `/details`, `/location`, `/growth/local`, private routes.
4. Spot-check homepage + header links resolve to final service paths (one hop).
5. Confirm `/cleaner/apply/form` still `noindex,nofollow`.
6. Confirm www → apex and `.com` → `.co.za` unchanged.
7. After EO GSC auth (separate): monitor Coverage / Page indexing for the five URLs — **do not** request indexing unless authorised.

---

## 7. Rollback plan

1. Revert the eight application/test files listed in §5 (or revert the merge commit).
2. Disposition docs may remain as audit artefacts.
3. No DNS, Plesk, or GSC rollback required for this package (no production mutation performed).
4. If window cleaning were accidentally 410’d again, restore `SEO_REBUILD_PHASE >= 2` behaviour and sitemap inclusion.

---

## 8. Claims requiring verification

| Claim / surface | Action |
|-----------------|--------|
| “4,500+ Homes Cleaned” on service heroes | Marketing / Ops verify or suppress |
| Lead prices in titles (`SERVICE_TITLE_LEAD_PRICE`, R250 standard band) | Reconcile to transactional pricing SoT (P1A Condition 5) |
| “Vetted” / identity-checked cleaner language | Ops / Legal confirm process wording |
| Move-out ~R800 indicative band | Pricing SoT confirmation |
| Insurance / same-day / network size | Do **not** publish new claims without source |

---

## 9. Items requiring confirmation

| Item | Owner |
|------|-------|
| Formal approval that provisional repo remediation may merge | EO / governance |
| Authorisation to deploy | Release / EO |
| GSC monitoring / any indexing request | EO (SEO-MIG-002 still Deferred) |
| Price-band reconciliation ship | Marketing + Finance/Pricing |
| Century City + city-phrase ownership | Marketing + SEO Eng |

---

## 10. Proposed next authorization (exact)

> **Authorize EO review of PR #89 tip `0ecc6086f8a51e39336ed6e540c21b69b281dfb2` on `seo/fix-001-002-prod-ready` (SEO-FIX-001/002 production package + Window Cleaning homepage CTA removal at `6e6a1429225a0513e0bb58ba688247e367104ab5`). Preview/CI verification against that exact tip SHA only. Do not authorize production merge, production deploy, GSC writes, sitemap submission, indexing requests, DNS/Plesk changes, or booking-v2 catalog expansion for window cleaning.**

Optional follow-on (separate):

> **Authorize EO review of formal SEO Engineering mandate / Constitution / Interaction Matrix so SEO-FIX packages can exit provisional status.**
