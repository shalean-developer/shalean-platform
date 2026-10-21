# WordPress-style blog writing repair — 21 October 2026

Decision: CONDITIONAL PASS for local implementation and review. Final CI, deployed staging acceptance and actual phone visuals remain required. Production release is held.

## Authority and scope

Farai explicitly instructed: “FIX IT, IF POSSIBLE TO COPY WORDPRESS BLOG WRITTING DESIGN” after the eight-defect re-audit. This is a bounded operational and release-blocking repair of the existing blog editor. It does not expand the frozen redesign programme or create another release authority.

Baseline main/staging: `29a5b16eff9ac7c10c336a168a42c26f5e9ce5f4`. Production remains `0481fa546766e3b6f005f11c80bdaf0682a2d3af`. Draft release PR #990 remains the sole production candidate; its current checked head precedes these writing changes.

Design reference: the WordPress Block Editor's document canvas, top toolbar, block inserter and collapsible post settings. References: https://wordpress.org/documentation/article/wordpress-block-editor/ and https://wordpress.org/documentation/article/page-post-settings-sidebar/. The implementation uses Shalean's existing editor, schema and secure APIs; it adds no dependency, database migration, external service, workflow or hosting configuration.

## Defect acceptance map

| Defect | Implemented behavior | Required evidence |
| --- | --- | --- |
| WR-06 Recovery can discard newer writing | Pending recovery locks writing and saving. Before restoring, both browser copies are persisted; the other copy remains available across reload. A storage failure keeps the current document. Retired records stay read-only. Copies clear only after an acknowledged server save. | Actual PostEditorForm tests for delayed identity, reload, copy switching, quota failure, save acknowledgement and retirement; deployed recovery UI check. |
| WR-07 Misleading Saved/enabled Save | Header says Recovery needs review and Save is disabled until the choice is resolved. The notice and choice buttons sit outside disabled editing fieldsets. | Rendered form assertions and staging check. |
| WR-08 Invisible move/delete icons | Editor-scoped button dimensions, zero icon-button padding and non-shrinking SVGs replace conflicting utilities. Source controls appear on block hover/focus and remain visible on touch devices. Shared button utilities are unchanged. | Staging computed icon widths and keyboard use. |
| WR-09 Clipped headline | An expanding, wrapping title textarea shows the whole title. Enter focuses the writing canvas. | Existing unsaved-title/preview tests updated for the textarea; staging wrapping and no-overflow check. |
| WR-10 Formatting blocked across sections | Formatting applies independently to eligible prose ranges, skips images/atomic sections and commits as one Undo step. A consistent list style is applied to mixed prose; generic nested-source transactions remain rejected. Paragraph conversion retains wrappers and anchors. | Actual TipTap mixed-document, keyboard, inline-image, stable-ID, anchor and Undo tests; deployed selection check. |
| WR-11 Bottom-only insertion | A sticky plus inserter adds content after the active paragraph/list. Following prose receives a separate stable source ID. One Undo restores exact original source. New empty structured blocks open their controls. Outside interaction/Escape closes the inserter. | Actual TipTap order/schema/Undo/Redo tests and a rendered inserter/image/Undo interaction; staging insertion check. |
| WR-12 Settings obscures Preview | Settings docks in a separate 320px grid column when the editor has 1120px available; smaller workspaces use a named dialog, backdrop, focus containment and an inert document. Preview closes settings. Writing and preview retain their 720px maximum body width. | Rendered settings/Preview tests; staging geometry, dialog keyboard and actual phone checks. |
| WR-13 Unnamed file input | Featured-image file input has an explicit accessible purpose. | Rendered accessibility assertion and staging label inspection. |

## Preservation and boundaries

Untouched source objects, IDs, raw HTML, captions, FAQ options and block order retain their existing round-trip behavior. Inserting inside a prose source intentionally splits it at a paragraph/list boundary, preserving the original ID for preceding prose and assigning a fresh ID to following prose. The server's existing schema accepts the result. Undo restores exact original objects.

Recovery continues using per-user/per-post versioned browser keys. A before-restore entry contains only the existing authoring snapshot and timestamp, never credentials. Persistence happens before replacing current writing and fails closed if both copies cannot be kept. The original expected-updated-at conflict check and server authorization remain authoritative.

Booking, payments, cleaner earnings, payouts, invoices, Zoho, shared packages, migrations, scheduler, authentication and server save/publication implementations are outside this change. Repeated staging paragraphs are test content, not duplication. The fixture's 1×1 inline image is not representative article photography; it is retained.

## Verification and staging plan

Final local checks and exact-head CI are recorded in the PR. Required checks: complete blog suite, critical suite, typecheck, enforced booking lint, production Webpack build and route checks. One initial critical run failed because the sparse checkout lacked the unchanged mobile help contract file; the exact HEAD blob was materialized before repeating the suite. No test or guard was weakened.

Local results: complete blog suite 231/231 across 32 files; critical suite 1,486/1,486 across 128 files; typecheck passed; enforced booking lint passed with four existing warnings; scoped editor/test lint passed with zero errors and seven hook warnings. The new rendered insertion/Undo interaction uses a test-only empty Range geometry shim because JSDOM has no browser layout. CI build and deployed browser geometry remain separate evidence.

Use only the existing isolated acceptance draft, after comparing a fresh row to its backup. Verify recovery lock/choice, title wrapping, visible icons, mixed formatting and Undo, insertion beside the active paragraph, current unsaved preview, settings docking/dialog, and a real save/reload. Restore every fixture field except updated_at; retain normal receipts/revisions. The owner's separate draft and all production content remain outside the fixture test.

Follow the governed automatic GitHub-to-Plesk staging process. Verify canonical deploy-branch ancestry, actual environment SHA, staging database, test payment modes, disabled outbound messaging, health and a fresh rollback receipt. Do not manually race an active deployment.

Do not claim a phone PASS from a requested viewport unless actual measured dimensions change. An actual phone review remains outstanding. Complete the bounded #990 candidate and its exact-head checks only after source/staging acceptance. Production still requires explicit owner release approval and the existing five immutable migration/recovery plan.

## Recovery

The app-only repair can revert to the prior reviewed staging runtime if needed. Stored primary recovery snapshots retain their existing shape; the additional before-restore entry is additive. Schema/security fixes remain forward-only. Preserve current runtime and receipt evidence before activation, and stop on unexpected source, environment, health or fixture changes.
