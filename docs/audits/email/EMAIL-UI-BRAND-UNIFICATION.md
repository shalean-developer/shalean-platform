# Email UI brand unification

Record: EMAIL-UI-2026-11-08 · Engineering · Prepared for owner review

## Objective and authority

Owner request: make every email-system interface match https://pricing-test.shalean.co.za. Source baseline: `f196a6cfefb56a5a96e0f1d3e557cf38064f5294` in `shalean-developer/shalean-platform`. This isolated change follows the existing homepage brand and repository AGENTS.md. The existing end-to-end consent/delivery acceptance evidence remains in the adjacent email audit records.

## Coverage and implementation

| Surface | Implementation |
| --- | --- |
| Campaign drafts, campaigns and marketing templates | Shared branded workspace, navigation, navy header and consistent controls |
| Template library and editor | Same workspace, typography, spacing and controls |
| Lifecycle dashboard and confirmation dialog | Shared workspace and locally scoped dialog theme |
| Delivery, timeline, retry/recovery, health and analytics | Common navigation and branded subpages; contained keyboard-accessible table scrolling |
| Customer and synthetic preferences | White branded cards, blue primary actions and clear state labels |
| Synthetic journey checks | Branded header and explicit synthetic/no-send notice |
| Unsubscribe confirmation/result pages | Self-contained navy/blue responsive layout and visible keyboard focus |
| Shared email HTML, lifecycle, payment recovery, booking, subscription, cleaner and refund messages | Canonical logo shell, navy text, blue links/actions and consistent corners |
| Restricted inbox acceptance UI and message | Current subject shared between UI/server; accurate delivery status wording; branded message HTML |

The theme uses homepage navy `#00164e`, blue `#0051ff`, background `#f5f7fb`, Geist for web UI and email-safe Arial fallback. CSS is scoped to the email workspace/preferences/dialogs. No new dependencies or JavaScript fetching are introduced by the shared workspace.

## Preserved behavior

Source review: recipients, provider credentials, consent decisions/generation, unsubscribe token creation/validation/escaping, suppression checks, idempotency, retry rules, authentication/authorization, queries, totals and mutation handlers are unchanged. The subscription provider boundary is untouched; its template fragments receive the brand shell. User-authored stored drafts are not rewritten. No emails were sent and no database/provider/environment settings were changed during this style task.

The shared transactional shell retains its existing help/social footer and URLs. This is an application UI/template release, not a campaign launch or production-readiness decision.

## Verification

- Critical regression suite: 169 files, 1,811 tests passed.
- Final email/refund regression suite: 35 files, 348 tests passed.
- Required booking-core lint: passed, four warnings and no errors.
- Changed TypeScript/TSX lint: no errors, 15 warnings in existing component patterns.
- `git diff --check`: passed.
- Full local typecheck: initial attempts were killed at the workspace memory limit; bounded 3 GB attempt exhausted the Node heap. Full Webpack build: worker killed with SIGKILL during compilation. Neither counts as a pass; final-head CI must pass before merge.

## Release and acceptance plan

After owner authorization: publish the reviewed changes on an isolated branch, open a PR, and require CI typecheck, critical tests, booking-core lint and Webpack build on the final head. Resolve failures and concurrent main changes before merging. Then wait for the exact merged staging artifact, activate through the existing guarded Plesk staging deployment and retain the previous runtime backup. No migration, environment update, provider contact change, campaign activation or production deployment is included.

Post-deployment: verify staging health and exact release SHA; inspect campaign drafts, template library/editor, lifecycle, delivery/timeline/recovery/health/analytics, customer preferences and an inert unsubscribe result at desktop and narrow mobile widths. Check navigation, headings, logo visibility, control wrapping, table scrolling, keyboard focus and dialog theme. Do not click a current signed unsubscribe link or any send/consent/retry action as part of visual verification. Review email HTML using isolated fixtures; new live sends require their approved test scope.

Success: the listed surfaces use the homepage brand and remain usable on mobile, with existing email behavior preserved. Monitor staging health and runtime/browser errors. Revert the source commit and restore the prior Plesk runtime backup if the release fails. No planned downtime; brief staging restart is possible. Owner is the release approver; production remains outside this request.

Gate: CONDITIONAL PASS for publication/release preparation. Final CI, owner release authorization and deployed desktop/mobile visual verification remain required; this document does not claim the new styling is live.
