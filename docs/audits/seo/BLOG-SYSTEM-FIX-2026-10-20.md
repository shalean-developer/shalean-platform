# Blog system audit repair — 20 October 2026

Status: implementation and local regression checks complete; database migrations verified on staging. Application staging acceptance, required GitHub checks, merge and production promotion remain release gates. No production application or database changes were made during this repair turn.

The owner authorized repairs to the 27 finding groups in the end-to-end audit, with an explicit constraint to preserve working behavior. This is a bounded CMS security/data-integrity repair, not a redesign. Branch is based on main `87dad21887ee3eb78b39e6c34bcae9d2b5fe0c7e`.

## Finding traceability

| ID | Implemented correction | Evidence / release acceptance |
| --- | --- | --- |
| 01 | Remove mutable user-metadata authorization, revoke direct browser CMS writes, use current RBAC for editorial reads. Helpers moved out of public RPC schema. | Isolated PostgreSQL role/expiry/revocation/scope tests; staging grants and security advisors. Shared legacy non-blog helper is owner-only; verify owner analytics/sales access during runtime smoke. |
| 02 | Require content.draft for drafts and content.publish for new/live/scheduled publication transitions; retain Office verification. | API boundary tests cover draft/publish, existing-live edits, Office verification, paused scheduling and reserved aliases. |
| 03 | Browser recovery scoped by authenticated user and article, seven-day validity, dirty navigation warning, session-expiry guidance. | Code review; browser refresh, expired session and recovery acceptance required on staging. No credentials stored. |
| 04 | Ordered block model replaces destructive document flattening. Preserve IDs, unsupported-by-TipTap structured content and interleaved placement. | Ordered-model and actual rendered layout tests; transaction round-trip test. |
| 05 | Require exact expected_updated_at, row-lock and reject stale saves with recoverable conflict UI. | PostgreSQL stale-editor test; two-tab browser smoke pending. |
| 06 | Transactional article, tags, prior revision and save receipt; request fingerprint and idempotency key. | PostgreSQL tag-failure rollback and duplicate-retry tests; staged RPC retry inside rolled-back transaction. |
| 07 | Signed, ten-minute, one-post preview links; live permission recheck; server-side draft loading; noindex/no-store/no-referrer. | Expiry, tamper, scope and revocation tests. Preview route smoke on staging required. Global shared preview secret is no longer sent to browsers. |
| 08 | Due-publication worker validates quality, links, images and current publisher permission; compare-and-swap release; explicit SAST times. | Six scheduler tests. Job registered inactive; API refuses schedules until activation. Staging cron target is not configured. |
| 09 | Published slugs locked rather than silently stranding URLs. Invalidate public tag, old/new paths, taxonomy children and sitemap on saves/unpublish. | Historical-publication slug lock test. Runtime cache/unpublish smoke required. Renames require a separately governed redirect change. |
| 10 | Link validation queries published/due targets, not every CMS draft. | Target-filter and missing CMS-only target regressions. |
| 11 | Prevent publication at retired aliases; mark existing legacy rows read-only/retired. | API validation plus list/editor changes; legacy redirects retained. |
| 12 | Apply normalized saved record, revision, preview query, receipt and governance warnings to client state. | API/transaction contracts; browser normalization smoke pending. |
| 13 | Canonical field read-only and self-derived; API rejects malformed/nonself overrides. | Canonical regressions; public self-canonical policy retained. |
| 14 | Editor describes shared public booking section; legacy custom CTAs retained as reference. Readiness reflects actual public conversion template. | Publish regression without redundant authored CTA; existing public conversion stack retained. |
| 15 | One responsive settings tree, unique IDs, no nested main; editor textbox semantics; live/focused errors. | Full editor static render verifies unique IDs and landmarks; keyboard/mobile browser smoke pending. |
| 16 | Save draft / Publish post / Update published post / Schedule post labels follow status. | Rendered action-label tests. |
| 17 | Bounded fetch timeouts, catch/finally, retryable errors and preserved inputs. Disable edits while saving to prevent server receipt overwriting in-flight typing. | Error/render contract; offline/timeout browser smoke pending. |
| 18 | Confirm template replacement and keep complete previous ordered body for undo. | Code review; browser undo smoke pending. |
| 19 | Shared image authoring/display policy; reject unsupported images instead of silently replacing them; automatic hero behavior stated. | Image policy regression; upload smoke pending. |
| 20 | Preserve omitted seo_internal_link_context on updates. | Real PostgreSQL round-trip regression. |
| 21 | Off-site research citations are not internal Shalean link targets. | Citation regression. |
| 22 | Blog publisher logo uses canonical Shalean logo asset instead of a cleaning photograph. | Source change; live JSON-LD smoke required after deployment. |
| 23 | Accept controlled featured/slug and inline/slug media folders. No deletion of possibly shared uploaded files. | Path regex review; staged upload/association acceptance pending. |
| 24 | Server pagination, search, exact totals and complete status counts replace client filtering of first 500 records. | Source/type checks; multi-page browser acceptance pending. |
| 25 | Disable StarterKit's duplicate Link extension; body toolbar allows H2-H4; sanitize authored H1 to H2 and preserve anchor IDs. | Heading sanitation regression; browser console smoke pending. |
| 26 | Fix pricing-authority fixtures and add a dedicated blog CI regression gate. | 137 blog tests and 1,486 critical tests passed locally. |
| 27 | Resolve repair hints through to commercial/location destinations; commercial aliases cannot be recommended as related-guide slugs. | Claremont repair-hint regression. |

## Database and staging evidence

Forward migrations, generated by Supabase CLI 2.121.0:

1. `20261020155014_blog_cms_permission_boundary.sql` — direct browser write boundary and live RBAC predicates.
2. `20261020155213_blog_atomic_editor_save.sql` — versioned transactional save, private revisions/receipts and schedule metadata.
3. `20261020155854_blog_schedule_publication.sql` — inactive five-minute job and service-only readiness predicate.
4. `20261020162025_blog_editor_security_advisor_followup.sql` — private predicate schema, explicit service-only policies and pinned trigger search path.

Applied only to staging project `uwvnmluiqbczeduzjgse`, using the exact source/receipt transaction emitted by `scripts/audits/blog-editor-migration-apply.mjs`. Each immutable version, name and SQL hash was read back and matched. Prior applied versions were not edited. Staging initially contained zero blog posts. The real save RPC created one isolated draft, returned an identical retry receipt, and the whole test transaction was rolled back; staging again contains zero posts, receipts and revisions. Anonymous/authenticated writes to all five CMS tables are denied. Only service_role may call the save RPC. New blog-specific advisor findings were cleared. Other pre-existing project findings are outside this repair.

The previously applied kitchen-grease migration `20261020150111` is included byte-for-byte from PR #988 so production's existing ledger version remains represented in the release source. It is not reapplied to production or rewritten. PR #988's separate evidence/test review comments remain separately reviewable; this repair does not assert that they were resolved.

## Validation

- `npm run test:blog`: 137 cases across 23 files passed (including actual migration SQL in isolated PostgreSQL).
- `npm run test:critical`: 1,486 cases across 128 files passed.
- `npm run lint:booking-core`: passed.
- Targeted ESLint errors for all changed TypeScript/TSX files: none.
- `npm run typecheck`: passed from a clean generated-types state. An interrupted local build generated an existing Next route-export error for unchanged `booking-v2/quote/route.ts`; generated output was cleaned. No booking code or type-check configuration was changed.
- Migration filename validation and `git diff --check`: passed.
- Local Webpack production build: stopped by SIGKILL during compilation; no successful local build is claimed. CI production build remains required.

## Release order and preservation controls

1. Review this exact diff and all required GitHub checks; do not bypass CI or Office verification.
2. Confirm production source authority. Live production is `0481fa546766e3b6f005f11c80bdaf0682a2d3af`, and its unrelated app paths differ from main. Blog/auth paths matched at audit. Never deploy an old-main bundle over newer production behavior. Reconcile through the governed release authority before promotion; do not add unrelated financial code to this blog PR.
3. Apply only the reviewed forward migration IDs in order, with exact ledger receipts. Do not run an unreviewed bulk db push against production. Retain the already-applied `20261020150111` receipt.
4. Deploy the exact candidate to staging through the governed Plesk workflow. Verify owner/draft-author/unrelated-role boundaries, session recovery, ordered-content no-op save, concurrent edits, normalized save receipt, draft preview/noindex/cache headers, image uploads, search/paging, canonical and publisher logo.
5. Configure the staging cron target through the existing protected configuration mechanism (no credentials in SQL evidence); activate the job only for the verified SHA, and test due/future/held/retry cases with staging-only fixtures.
6. Obtain the normal explicit merge/release authorization required by the engineering standard. Promote a production-compatible SHA only after staging acceptance. Repeat live public/admin smokes and content invariants.

## Recovery

Before promotion record the actual live Plesk release directory and exact rollback SHA; an earlier session's rollback directory is not a current rollback target. Keep cron inactive if acceptance fails. Database changes are additive except permission tightening and moving predicates; retain their security protections on application rollback. Never restore mutable-metadata authorization or direct browser writes. Any schema correction must be a new forward migration. Reconcile an editor conflict against the latest revision rather than replacing a whole row; preserve revision and receipt records.
