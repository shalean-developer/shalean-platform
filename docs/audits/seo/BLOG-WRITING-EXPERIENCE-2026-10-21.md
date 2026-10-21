# Blog writing and viewing experience — 21 October 2026

Status: implementation prepared. Staging and actual phone visual acceptance pending. No production release approval.

## Scope and baseline

Owner request: one clean writing canvas, compact settings, accurate preview and a simpler article template after the screenshot/source/browser audit. Preserve working saves, recovery, conflicts, permissions, scheduling and publication guards. Repetitive staging test prose is not an automatic-duplication defect.

Baseline source/staging: `7cfac65ff0f91ddebd0ce138697d0fa228b8a841`. Production: `0481fa546766e3b6f005f11c80bdaf0682a2d3af`. Production candidate #990 remains draft and unapproved.

Read-only preflight: both staging posts remain drafts; owner article digest `bcb0a06465715d1358250c1262809f42`; isolated fixture digest `b953f3b4cf28e86b43be97d6193fad93`; twelve staging jobs. Production has 88 published posts and original-field digest `f822d64e33e8e0f862fad1aec33df2a0`. Actual health has no issues: staging test/test and disabled outbound messaging; production live/live.

## Requirements and traceability

| Requirement | Change | Verification |
| --- | --- | --- |
| WR-01 Continuous writing | One TipTap document; immediately writable blank posts; ordered text and structured node views; shared history. | Mixed-tree round trips; individual prose edits; image move/Undo with caption; FAQ edit/Undo; exact original HTML after Undo; strict-schema legacy prose conversion; malformed pasted wrappers and duplicate stored IDs. |
| WR-02 Compact settings | Fixed toggleable drawer independent of article width; Escape restores focus; measured header height supplies sticky-toolbar offset. | Unique settings/IDs; keyboard open/close retains unsaved title; retired/read-only records retain Settings, saved-version and Preview access while editing stays disabled. Actual narrow-screen layout pending. |
| WR-03 Current preview | In-place Write/Preview uses current unsaved state and shared public article frame, display preparation, sanitizer and body renderer. | Draft and published cases show latest title/content, keep editor DOM/session and make no save/publish request. |
| WR-04 Simpler article | Headline/lede before restrained hero; shared typography and width; authored FAQ before one closing booking section; one related group and TOC sidebar. | Shared preview/public body comparison; FAQ/CTA order and single closing CTA assertions; actual staging layout pending. |
| WR-05 Honest states | Known 1×1 placeholder omitted, failed/tiny hero collapses; related cards omit known placeholder. Structure checks do not imply editorial quality. Draft preview has no Published label. | Placeholder and empty-canvas tests; successful/failed image visual cases pending staging. |

## Compatibility and safeguards

No migration, data correction, bulk rewrite, publication, scheduler/configuration change or new dependency. Save/auth/recovery/schedule/security implementations are retained. Booking, payments, earnings, payouts, invoices, Zoho, shared packages and migrations are outside scope.

Untouched blocks retain exact source objects, raw HTML, stable IDs, table markup, image captions and FAQ options. Metadata-only saves do not flatten content. Direct legacy-prose edits can convert only the edited block to existing schema-valid rich_text with its ID and semantic heading/content in HTML. Undo restores original source. Legacy table/attribution HTML stays preserved with a visual view and explicit advanced source editing; comparison tables retain their visual cell editor.

Additional mixed-selection QA reproduced a real preservation defect in the first canvas implementation: applying a list across prose, an image and an FAQ could nest source wrappers and flatten structured content. Formatting now stays within one prose section, keyboard shortcuts use the same boundary, and a transaction filter rejects nested source wrappers. Structured editing selects its own node; image insertion beside a structured selection preserves that section. Eighteen regression cases cover mixed selections, keyboard commands, direct-command defense, ordinary formatting, stable IDs and Undo. This is distinct from the deliberately repeated acceptance-test prose.

The unsaved preview covers the article, not global navigation/footer or dynamically selected related guides. It neither saves nor publishes, renews credentials nor reloads the editor.

## Verification register

Initial reviewed source #995 merged as `0b0ace355d7ba2d6cac5e63b4c688cbf96f724c0` after exact-head CI passed, including the production Webpack build and route crawl. Final local verification of the preservation follow-up: blog suite 217 tests in 32 files PASS; critical suite 1,486 tests in 128 files PASS; typecheck PASS. Two initial static mobile-contract failures were due to the sparse local checkout; reading the unchanged HEAD help file resolved them. Exact follow-up head CI remains required. Enforced booking lint PASS with existing warnings. Focused changed-code lint has no errors; a refs-analysis warning concerns deferred TipTap parser/node-view callbacks, not ref reads during render.

No local-browser visual PASS: the connected browser cannot reach executor localhost. Use deployed staging. Do not claim phone PASS unless a requested viewport actually applies or the owner checks a phone.

## Staging and recovery

After exact-head CI and review, merge to main through governed automatic GitHub-to-Plesk deployment. Verify deployment ancestry, actual environment SHA, staging database, test payment modes, disabled messaging and fresh rollback. Never race an active deployment with manual pulling.

Use only the isolated acceptance draft for edits/save/reload. Check current-edit preview without writes, mixed content/order, Undo, image states, sticky toolbar, narrow layout, keyboard settings and account-menu session preservation. Restore all original fixture fields except updated_at; retain normal receipts/revisions. Owner article checksum, draft states, production digest and unrelated job definitions must remain unchanged.

Keep #990 draft. Prepare the bounded production candidate only after source acceptance; staging acceptance, phone review and explicit owner release approval precede production.

Decision: CONDITIONAL PASS for continued source/staging validation; production release held.
