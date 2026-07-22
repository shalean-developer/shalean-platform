/**
 * shalean.com Plesk FULL redirect map → shalean.co.za HTTP verification (2026-07-22)
 *
 * **Verdict: PASS**
 *
 * Replaces the prior minimal emergency `.htaccess` set with the complete explicit map
 * generated from `apps/web/lib/seo/shaleanComMigrationMap.ts`, while restoring preserved
 * LiteSpeed cache, WordPress, and cPanel PHP handler blocks from the pre-migration backup.
 *
 * **Out of scope:** Search Console, indexing, GBP, DNS, canonical/metadata/schema/content
 * changes, and production application deploys.
 */

## Summary

| Field | Value |
|-------|-------|
| Status | `SHALEAN_COM_MIGRATION_STATUS = LIVE_HTTP_VERIFIED` (full map) |
| Host | LiteSpeed / PleskLin webspace `shalean.com` (`public_html`) |
| Approved map entries | **193** unique source paths |
| Represented in `.htaccess` | **193** explicit host-scoped `RewriteRule`s + 1 path-preserve fallback |
| Missing / duplicate / conflicting | **0 / 0 / 0** |
| Artifact | `apps/web/ops/seo/shalean-com-plesk.htaccess` |
| Sanitized JSON | `apps/web/ops/seo/shalean-com-plesk-full-map-http-verification-2026-07-22.json` |
| Live apply | **Succeeded** (2026-07-22T08:00:45Z) |
| Rollback | **Not required** (all gated probes passed) |

## Generation method

1. Source of truth: `getShaleanComMigrationRules()` / `buildShaleanComHtaccessRules()` in `shaleanComMigrationMap.ts`.
2. Composed artifact order:
   - `# BEGIN LSCACHE` … `# END NON_LSCACHE` (restored from pre-migration backup)
   - `# BEGIN SHALEAN.COM FULL MIGRATION MAP` (generated explicit map + fallback)
   - `# BEGIN WordPress` … `# END WordPress`
   - cPanel PHP ini + handler blocks
3. Structural validation: every map destination present; fallback last; `R=301,L` only in migration block; WordPress/LSCACHE preserved.
4. Automated Vitest coverage validates all 193 map entries against the committed artifact.

## Backup confirmation

| Location | Path / name |
|----------|-------------|
| Local (gitignored) | `apps/web/ops/seo/backups/shalean-com-htaccess-BEFORE-2026-07-22T08-00-45-764Z.htaccess` |
| Remote (beside live) | `.htaccess.bak-before-com-migration-2026-07-22T08-00-45-764Z` |
| Prior content backed up | Minimal emergency redirect set (3487 bytes) from earlier same-day apply |

Backup files and the credential-using apply script are **not** committed.

## Live apply controls

1. Temporary FTP user created for `public_html` only.
2. Prior `.htaccess` downloaded and mirrored as remote `.bak-*`.
3. Approved full artifact uploaded; byte count confirmed (38988).
4. Representative one-hop HTTP verification (gated; rollback on any failure).
5. Temporary FTP user **deleted** immediately after apply (`temp_ftp_user_deleted: true`).

## Representative live results (one-hop 301)

| Source | Status | Location | Hops |
|--------|--------|----------|------|
| `https://shalean.com/` | 301 | `https://shalean.co.za/` | 1 |
| `https://www.shalean.com/` | 301 | `https://shalean.co.za/` | 1 |
| `https://shalean.com/blog` (+ www, trailing slash) | 301 | `https://shalean.co.za/blog` | 1 |
| `https://shalean.com/services/standard-cleaning` | 301 | `https://shalean.co.za/services/standard-cleaning-cape-town` | 1 |
| `https://www.shalean.com/services/standard-cleaning/` | 301 | `https://shalean.co.za/services/standard-cleaning-cape-town` | 1 |
| `https://shalean.com/services/deep-cleaning` | 301 | `https://shalean.co.za/services/deep-cleaning-cape-town` | 1 |
| `https://shalean.com/location/cape-town/sea-point` | 301 | `https://shalean.co.za/locations/sea-point-cleaning-services` | 1 |
| `https://www.shalean.com/location/cape-town/camps-bay/` | 301 | `https://shalean.co.za/locations/camps-bay-cleaning-services` | 1 |
| `https://shalean.com/cleaning-services/sea-point` | 301 | `https://shalean.co.za/locations/sea-point-cleaning-services` | 1 |
| `https://shalean.com/how-it-works` | 301 | `https://shalean.co.za/#how-it-works` | 1 |
| `https://shalean.com/testimonials` | 301 | `https://shalean.co.za/reviews` | 1 |
| `https://shalean.com/some-unmapped-legacy-page` | 301 | `https://shalean.co.za/some-unmapped-legacy-page` (fallback) | 1 |
| `https://shalean.com/contact?utm_source=test` | 301 | `https://shalean.co.za/contact?utm_source=test` (QSA) | 1 |

### HTTP → HTTPS (platform, not map)

Plesk/LiteSpeed upgrades `http://` to same-host `https://` **before** migration rules. Documented as platform behaviour; not counted as a migration-map multi-hop failure.

| Source | Status | Location |
|--------|--------|----------|
| `http://shalean.com/` | 301 | `https://shalean.com/` |
| `http://www.shalean.com/services/standard-cleaning` | 301 | `https://www.shalean.com/services/standard-cleaning` |

Subsequent HTTPS request then one-hops to the approved `.co.za` destination.

### Malformed / unexpected

| Source | Observed | Notes |
|--------|----------|-------|
| `https://shalean.com/%2e%2e/etc/passwd` | 301 → `https://shalean.co.za/etc/passwd` | Path-normalize then path-preserve fallback; leaves `.com` |
| `https://shalean.com/wp-admin` | 301 → `https://shalean.com/wp-admin/` | Directory trailing-slash (same host) before rewrite; slash form then leaves via host-scoped fallback |

## Validation results (repo)

- Vitest `shaleanComMigrationMap.test.ts`: **15/15 PASS**
- Structural apply gate: **PASS**
- Live gated cases: **20/20 PASS**
- Rollback: **not executed** (not required)

## Excluded sensitive artifacts (not in git)

- `apps/web/ops/seo/backups/**` (including BEFORE/APPLIED meta)
- `apps/web/ops/seo/apply-shalean-com-plesk-htaccess.mjs`
- `apps/web/ops/seo/_generate-full-htaccess.mjs`
- `apps/web/ops/seo/_dump-migration-htaccess.ts`
- Temporary FTP credentials (never written to repo; user deleted post-apply)
- `.vercel/`, unrelated `docs/audits/ai-ranking/`

## External platforms

No Search Console, GBP, DNS, indexing, or other external-platform actions were performed.
