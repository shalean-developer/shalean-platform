# shalean.com Plesk → shalean.co.za HTTP verification (2026-07-22)

**Status recorded in repo (at time of this 193-rule apply):** `SHALEAN_COM_MIGRATION_STATUS = LIVE_HTTP_VERIFIED`  
**Current complete artifact (PR #94+):** repository candidate with **273** explicit rules; status is `PENDING_EXTERNAL_PLESK` because **80** location-expansion rules are not yet Plesk-applied/HTTP-verified. Do not treat the full 273-rule map as `LIVE_HTTP_VERIFIED`.  
**Host:** LiteSpeed / PleskLin webspace `shalean.com` (document root `public_html`)  
**Artifact applied (2026-07-22):** `apps/web/ops/seo/shalean-com-plesk.htaccess` (then **193** explicit rules)  
**Out of scope:** Search Console actions, Vercel deploy from this evidence note

## Method

1. Recoverable backup of prior `.htaccess` taken locally and as a remote `.bak-*` beside live file (backup file **not** committed).
2. Structural Apache/LiteSpeed rewrite validation of the approved rules (fallback last; host-scoped `R=301,L`).
3. Upload to Plesk WordPress document root via temporary FTP user (credentials not stored in repo; user deleted after apply).
4. Verification with one-hop probes (`HEAD` / `curl -sI --max-redirs 0`). Rollback gate: any 5xx, loop, chain, or wrong `Location`.

## Results (all PASS — one-hop 301)

| Source | Status | Location |
|--------|--------|----------|
| `https://shalean.com/` | 301 | `https://shalean.co.za/` |
| `https://www.shalean.com/` | 301 | `https://shalean.co.za/` |
| `https://shalean.com/blog` | 301 | `https://shalean.co.za/blog` |
| `https://www.shalean.com/blog` | 301 | `https://shalean.co.za/blog` |
| `https://shalean.com/blog/how-much-does-cleaning-cost-cape-town-2026` | 301 | `https://shalean.co.za/blog/how-much-does-cleaning-cost-cape-town-2026` |
| `https://shalean.com/services` | 301 | `https://shalean.co.za/services` |
| `https://shalean.com/contact` | 301 | `https://shalean.co.za/contact` |
| `https://shalean.com/quote` | 301 | `https://shalean.co.za/quote` |
| `https://shalean.com/locations/sea-point-cleaning-services` | 301 | `https://shalean.co.za/locations/sea-point-cleaning-services` |

## Closed evidence gap

Prior gap (same calendar day, pre-apply): `www.shalean.com/blog` returned WordPress **200** (`wp-json`). Post-apply: **301** to `https://shalean.co.za/blog` with no same-host chain.

## Repo hygiene

- Do **not** commit recoverable backup `.htaccess` contents or hosting credentials.
- Local ops backups (if present under `apps/web/ops/seo/backups/`) are gitignored for `*.htaccess`.
