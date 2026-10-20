# Blog system audit repair — 20 October 2026

Status: the main repair and logo follow-up are merged in #989/#992 and verified on staging. Production-compatible release #990 remains draft. Template replacement/undo has owner-reported manual acceptance; automated inspection after the native confirmation was blocked by browser focus timeouts. Scheduled-publication runtime acceptance remains open. Production has received no application or database changes from this repair.

The owner authorized repairs to the 27 finding groups in the end-to-end audit, with an explicit constraint to preserve working behavior. This is a bounded CMS security/data-integrity repair, not a redesign. Branch is based on main `87dad21887ee3eb78b39e6c34bcae9d2b5fe0c7e`.

## Finding traceability

| ID | Implemented correction | Evidence / release acceptance |
| --- | --- | --- |
| 01 | Remove mutable user-metadata authorization, revoke direct browser CMS writes, use current RBAC for editorial reads. Helpers moved out of public RPC schema. | Isolated PostgreSQL role/expiry/revocation/scope tests; staging grants and security advisors. Shared legacy non-blog helper is owner-only; verify owner analytics/sales access during runtime smoke. |
| 02 | Require content.draft for drafts and content.publish for new/live/scheduled publication transitions; retain Office verification. | API boundary tests cover draft/publish, existing-live edits, Office verification, paused scheduling and reserved aliases. |
| 03 | Browser recovery scoped by authenticated user and article, seven-day validity, dirty navigation warning, session-expiry guidance. | Code review; browser refresh, expired session and recovery acceptance required on staging. No credentials stored. |
| 04 | Ordered block model replaces destructive document flattening. Preserve IDs, structured content and interleaved placement. Missing legacy IDs are stabilized to the same DOM anchors the public renderer already uses before reordering. Rich HTML tables/attribution use source editing because the visual schema cannot preserve them; switching articles remounts editor state. | Ordered-model and actual rendered layout tests; transaction round-trip test. |
| 05 | Require exact expected_updated_at, row-lock and reject stale saves with recoverable conflict UI. | PostgreSQL stale-editor test; two-tab browser smoke pending. |
| 06 | Transactional article, tags, prior revision and save receipt; request fingerprint and idempotency key. | PostgreSQL tag-failure rollback and duplicate-retry tests; staged RPC retry inside rolled-back transaction. |
| 07 | Signed, ten-minute, one-post preview links; live permission recheck; server-side draft loading; noindex/no-store/no-referrer. | Expiry, tamper, scope and revocation tests. Preview route smoke on staging required. The legacy global credential is ignored; signing uses an undisclosed server secret. Forging a token with the old exposed credential is explicitly rejected. |
| 08 | Due-publication worker validates quality, links, images and current publisher permission; compare-and-swap release; explicit SAST times. | Seven worker tests; future dates cannot bypass the worker using Published status. Job registered inactive; API refuses schedules until activation. A forward follow-up isolates its protected target from unrelated cron jobs; runtime acceptance remains open. |
| 09 | Published slugs locked rather than silently stranding URLs. Invalidate public tag, old/new paths, taxonomy children and sitemap on saves/unpublish. | Historical-publication slug lock test. Save receipts survive a cache-refresh outage with an explicit warning. Runtime cache/unpublish smoke required. Renames require a separately governed redirect change. |
| 10 | Link validation queries published/due targets, not every CMS draft. | Target-filter and missing CMS-only target regressions. |
| 11 | Prevent publication at retired aliases; mark existing legacy rows read-only/retired. | API validation plus list/editor changes; legacy redirects retained. |
| 12 | Apply normalized saved record, revision, preview query, receipt and governance warnings to client state. | API/transaction contracts; browser normalization smoke pending. |
| 13 | Canonical field read-only and self-derived; API rejects malformed/nonself overrides. | Canonical regressions; public self-canonical policy retained. |
| 14 | Editor describes shared public booking section; legacy custom CTAs retained as reference. Readiness reflects actual public conversion template. | Publish regression without redundant authored CTA; existing public conversion stack retained. |
| 15 | One responsive settings tree, unique IDs, no nested main; editor textbox semantics; live/focused errors. | Full editor static render verifies unique IDs and landmarks; keyboard/mobile browser smoke pending. |
| 16 | Save draft / Publish post / Update published post / Schedule post labels follow status. | Rendered action-label tests. |
| 17 | Bounded fetch timeouts, catch/finally, retryable errors and preserved inputs. Disable edits while saving to prevent server receipt overwriting in-flight typing. | Error/render contract; offline/timeout browser smoke pending. |
| 18 | Confirm template replacement and keep complete previous ordered body for undo. | Blank-body application/undo observed. Owner manually confirmed that nonempty replacement/undo restored the exact original sentence. Automated post-confirmation inspection remained unavailable. |
| 19 | Shared image authoring/display policy; reject unsupported images instead of silently replacing them; automatic hero behavior stated. | Image policy regression; featured/inline JPEG uploads saved and rendered after reload on staging. |
| 20 | Preserve omitted seo_internal_link_context on updates. | Real PostgreSQL round-trip regression. |
| 21 | Off-site research citations are not internal Shalean link targets. | Citation regression. |
| 22 | Blog publisher logo uses canonical Shalean logo asset instead of a cleaning photograph. | Source change; live JSON-LD smoke required after deployment. |
| 23 | Accept controlled featured/slug and inline/slug media folders. No deletion of possibly shared uploaded files. | Both slug-scoped upload paths, persisted associations and actual image decoding verified on staging. |
| 24 | Server pagination, search, exact totals and complete status counts replace client filtering of first 500 records. | Search, published/draft filters, counts and pagination boundaries verified with the single staging fixture. Multi-page UI traversal is not claimed. |
| 25 | Disable StarterKit's duplicate Link extension; body toolbar allows H2-H4; sanitize authored H1 to H2 and preserve anchor IDs. | Heading sanitation regression; browser console smoke pending. |
| 26 | Fix pricing-authority fixtures and add a dedicated blog CI regression gate. | 143 blog tests and 1,486 critical tests passed locally. |
| 27 | Resolve repair hints through to commercial/location destinations; commercial aliases cannot be recommended as related-guide slugs. | Claremont repair-hint regression. |

## Database and staging evidence

Forward migrations, generated by Supabase CLI 2.121.0:

1. `20261020155014_blog_cms_permission_boundary.sql` — direct browser write boundary and live RBAC predicates.
2. `20261020155213_blog_atomic_editor_save.sql` — versioned transactional save, private revisions/receipts and schedule metadata.
3. `20261020155854_blog_schedule_publication.sql` — inactive five-minute job and service-only readiness predicate.
4. `20261020162025_blog_editor_security_advisor_followup.sql` — private predicate schema, explicit service-only policies and pinned trigger search path.

### Prepared scheduler isolation follow-up

`20261020190530_blog_scheduler_isolated_vault_target.sql` is a new forward migration. The four applied migration sources remain immutable. This follow-up is prepared locally and has not been applied to any shared database.

Staging has no shared `cron_http_targets` row, while nine other active jobs refer to that target. Populating the shared row would affect those jobs. The follow-up changes only the owned `publish-blog-posts` job, retains its inactive state, and leaves the shared target and every other job untouched.

The private invoker reads encrypted Vault entries `blog_scheduler_base_url` and `blog_scheduler_cron_secret`. It accepts only the owned production/staging HTTPS origins and always calls `/api/cron/publish-blog-posts`. It has no caller-selected destination or path. PUBLIC, anonymous, authenticated and service-role execution are revoked; the privileged job owner invokes it. The existing service-only readiness RPC returns a boolean and requires the isolated job and valid protected settings.

Read-only preflight found PUBLIC grants on the platform-owned `net.http_request_queue`. Current Supabase guidance confirms these are managed extension grants that the project `postgres` role cannot change; database privileges alone do not establish Data API exposure. An initially prepared grant-change approach was removed before any shared application. This migration leaves all `net` objects and grants unchanged. Zero-row requests using each environment's publishable key returned HTTP 406/PGRST106 for both `net` and `vault`; only `public` and `graphql_public` are exposed. The two identified public functions bridging to internal cron/network calls deny execution to anonymous/authenticated roles on both environments. The staging CLI login role is an administrative postgres member. Queue headers remain readable by trusted database login roles; Vault protects storage at rest. No queue contents or credentials were read. Platform references: https://supabase.com/docs/guides/troubleshooting/revoking-access-to-pg_net-objects-has-no-effect-0bbc16 and https://supabase.com/docs/guides/troubleshooting/database-roles-can-read-request-headers-queued-by-pg_net-ad6357.

Provision the environment's existing `CRON_SECRET` directly into its own protected Vault entry only after specific authorization for that credential transfer; never paste it into chat, source, logs or evidence. No secret has been retrieved or changed during preparation. The runtime test must cover due/future/held/retry cases with isolated noindex fixtures, preserve unrelated job settings, and verify the exact running application SHA. Activate only the blog job after acceptance. Disable only that job for scheduler recovery; retain forward migrations and encrypted configuration.

Applied only to the configured staging database, using the exact source/receipt transaction emitted by `scripts/audits/blog-editor-migration-apply.mjs`. Each immutable version, name and SQL hash was read back and matched. Prior applied versions were not edited. Staging initially contained zero blog posts. The initial real save-RPC transaction was rolled back after verifying idempotency. Subsequent browser acceptance left one unpublished noindex fixture, eight save receipts, seven revisions and two isolated uploaded images. Anonymous/authenticated writes to all five CMS tables are denied. Only service_role may call the save RPC. New blog-specific advisor findings were cleared. Other pre-existing project findings are outside this repair.

The previously applied kitchen-grease migration `20261020150111` is included byte-for-byte from PR #988 so production's existing ledger version remains represented in the release source. It is not reapplied to production or rewritten. PR #988's separate evidence/test review comments remain separately reviewable; this repair does not assert that they were resolved.

## Initial repair validation

- `npm run test:blog`: 143 cases across 23 files passed (including actual migration SQL in isolated PostgreSQL).
- `npm run test:critical`: 1,486 cases across 128 files passed.
- `npm run lint:booking-core`: passed.
- Targeted ESLint errors for all changed TypeScript/TSX files: none.
- `npm run typecheck`: passed from a clean generated-types state. An interrupted local build generated an existing Next route-export error for unchanged `booking-v2/quote/route.ts`; generated output was cleaned. No booking code or type-check configuration was changed.
- Migration filename validation and `git diff --check origin/main HEAD`: passed after removing a new-file trailing blank line identified by review.
- Local Webpack production build: stopped by SIGKILL during compilation; no successful local build is claimed. CI production build remains required.

## Scheduler isolation preparation validation

- 22 isolated PostgreSQL cases execute the new migration as a non-superuser that cannot manage the extension-owned queue. They cover preservation of unrelated jobs/shared configuration/platform grants, protected readiness, allowed origins, malformed credentials, fixed-endpoint requests and role boundaries.
- The full blog suite passes 165 cases across 24 files when run serially. A parallel local run hit the existing 30-second startup limit in both database fixtures; that timeout was retained. Canonical CI is still required.
- The main-based critical suite passes 1,486 cases across 128 files. Typecheck, targeted ESLint and booking-core lint pass; booking lint retains four existing unused-import warnings.
- Migration validation and whitespace checks pass. All four previously applied migration sources remain byte-for-byte unchanged. This follow-up is not applied and contains no credential values.

The first #993 CI head stopped at the production dependency audit before running tests: `follow-redirects` 1.16.0 was flagged by GHSA-q3jh-wrc6-jgq8 and GHSA-8r9p-f939-6h3c. The lockfile updates exactly that transitive package to the published compatible patch 1.16.1; Axios, Twilio and every other locked package version remain unchanged. After a fresh install, the production audit passes with its pre-existing approved nanoid exception, and the 165 blog / 1,486 critical tests and typecheck pass. No audit exception or check was weakened. Maintainer advisories: https://github.com/follow-redirects/follow-redirects/security/advisories/GHSA-q3jh-wrc6-jgq8 and https://github.com/follow-redirects/follow-redirects/security/advisories/GHSA-8r9p-f939-6h3c.

## Release order and preservation controls

1. Review this exact diff and all required GitHub checks; do not bypass CI or Office verification.
2. Confirm production source authority. Live production is `0481fa546766e3b6f005f11c80bdaf0682a2d3af`, and its unrelated app paths differ from main. Blog/auth paths matched at audit. Never deploy an old-main bundle over newer production behavior. Reconcile through the governed release authority before promotion; do not add unrelated financial code to this blog PR.
3. Apply only the reviewed forward migration IDs in order, with exact ledger receipts. Do not run an unreviewed bulk db push against production. Retain the already-applied `20261020150111` receipt.
4. Deploy the exact candidate to staging through the governed Plesk workflow. Verify owner/draft-author/unrelated-role boundaries, session recovery, ordered-content no-op save, concurrent edits, normalized save receipt, draft preview/noindex/cache headers, image uploads, search/paging, canonical and publisher logo.
5. Review and apply the isolated-target forward follow-up, provision its two protected Vault entries without exposing credentials, and test due/future/held/retry cases with staging-only fixtures. Activate only the blog job for the verified SHA. Preserve the unrelated shared target and job settings.
6. Obtain the normal explicit merge/release authorization required by the engineering standard. Promote a production-compatible SHA only after staging acceptance. Repeat live public/admin smokes and content invariants.

## Recovery

Before promotion record the actual live Plesk release directory and exact rollback SHA; an earlier session's rollback directory is not a current rollback target. Keep cron inactive if acceptance fails. Before any whole-application rollback, pause `/api/admin/blog/*` at the reverse proxy (for example, a reviewed server-level prefix rule returning 503) so older broad CMS endpoints cannot regain write access. Public blog serving and booking paths remain available. Remove that authoring pause only after a verified forward app fix. Database changes are additive except permission tightening and moving predicates; retain their security protections on application rollback. Never restore mutable-metadata authorization or direct browser writes. Any schema correction must be a new forward migration. Reconcile an editor conflict against the latest revision rather than replacing a whole row; preserve revision and receipt records.
