# Admin RBAC Priority 4 — Eight-Role UAT Matrix

This is the final acceptance matrix for the Admin Roles implementation plan. Automated tests are necessary but not sufficient: each real role-holder should complete the applicable workflow in staging before final production closeout.

## Global pass criteria

- Unknown Office pages fail closed.
- Direct API access is denied without the exact required permission.
- Navigation/search visibility never grants access by itself.
- Sensitive cleaner bank/document access remains separately permissioned and audited.
- Customer and booking exports require dedicated export permissions; large exports require bulk approval.
- Maker-checker payout duties remain separated between prepare, approve and release.
- Temporary/revoked/expired role assignments grant no access.
- My Work only exposes items whose exact permission and destination policy match.
- No role receives customer, cleaner, finance or message-body data outside its approved scope.

## Role acceptance journeys — live grant aligned

| Role | Must be able to | Must be denied |
| --- | --- | --- |
| Owner | Security/audit, access reviews, company finance, payout preparation/approval/release, operations, workforce, customer, marketing | Unknown/unregistered Office routes |
| General Manager | Operational oversight, customers, cleaner/team management, system health, payout viewing/preparation, low-level refund approval | Owner security/role administration, payout approval/release, full finance, pricing/integration owner-only controls |
| Operations Administrator | Booking/team operations, operational customer contact, system health, workforce earnings visibility | Company finance, payout administration, Owner security, marketing publishing |
| Finance Administrator | Full finance, invoices, reconciliation, payout preparation, workforce earnings visibility | Payout approval/release, customer administration, cleaner sensitive documents unless separately granted, marketing publishing |
| Customer Care | Customers, support bookings, WhatsApp/customer replies, refund requests | Cleaner administration, finance, payout administration, Owner security, marketing publishing |
| Workforce Administrator | Cleaner applications, cleaner documents, cleaner/team management, workforce earnings visibility | Booking scheduling/administration unless separately granted, finance, customer administration, Owner security, marketing publishing |
| Marketing Administrator | Blog drafting and marketing read/analytics workflows | Campaign publishing requiring `content.publish`, customer PII administration, finance, cleaner administration, Owner security |
| Supervisor | Assigned-team schedule/bookings, team assignment and workforce earnings visibility only within scope | Unscoped/company-wide bookings, unrelated teams, company-wide customers, finance, payouts, security, marketing |

## My Work acceptance

- Finance: overdue invoices and approved-unbatched earnings only with their exact permissions.
- Workforce: pending cleaner applications only with `application.decide`.
- Customer Care: unanswered WhatsApp conversations only with `customer.contact`; phone is masked on the card and message body is not copied into My Work.
- Marketing: draft blog work only with `content.draft`; ready campaign work requires `content.publish` and must remain hidden from the current live Marketing Administrator role unless that permission is explicitly granted later.
- Supervisor: must not receive Finance, Workforce, Customer Care or Marketing work items without those exact permissions; team-scoped booking work must remain limited to the assigned team.

## Live/staging evidence recorded 2026-08-08

- Priority 4, Priority 2, Priority 1, migration-governance and `web-test` CI were all green on the live-role-alignment change merged in PR #228.
- Staging and production RBAC tables contain the same eight active roles with matching permission sets.
- All eight staging UAT accounts are active; the Supervisor account is team-scoped.
- Representative staging permission checks passed fail-closed expectations:
  - Owner: `role.manage` and `payout.release` allowed.
  - General Manager: `finance.summary.view` allowed; `payout.approve` denied.
  - Operations: `booking.assign` allowed; `finance.full.view` denied.
  - Finance: `finance.full.view` allowed; `payout.release` denied.
  - Customer Care: `customer.contact` allowed; `cleaner.view` denied.
  - Workforce: `application.decide` allowed; `booking.view` denied.
  - Marketing: `content.draft` allowed; `content.publish` denied.
  - Supervisor: unscoped `booking.assign` denied; assigned-team `booking.assign` and `booking.view` allowed; unrelated-team assignment and finance access denied.

## Manual staging sign-off

For each of the eight staging role accounts:

1. Sign in and confirm the correct role dashboard.
2. Confirm sidebar, mobile navigation and command search only show permitted modules.
3. Open at least one permitted page directly by URL.
4. Attempt at least two prohibited direct URLs and confirm denial/no data leak.
5. Complete one normal role workflow without Owner intervention.
6. Verify My Work contains only role-appropriate items.
7. For scoped roles, verify records outside assigned branch/team are absent or denied.
8. Sign out and record PASS/FAIL plus evidence link/screenshot.

## Remaining closeout gates

Priority 4 is not yet fully closed until both of these are complete:

1. **Eight manual staging journeys:** browser-level sign-off for all eight role accounts using the steps above. Database and automated policy checks do not replace this user-interface acceptance step.
2. **Seven-day production observation:** review authorization failures, sensitive-access audit events, role changes, exports and payout maker-checker events for seven consecutive days after the final RBAC changes are in production.

If both gates pass with no unresolved high-risk findings, Priority 4 can be marked complete and the Admin Roles implementation plan can move to governance-only operation.