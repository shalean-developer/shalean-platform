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

## Role acceptance journeys

| Role | Must be able to | Must be denied |
| --- | --- | --- |
| Owner | Security/audit, access reviews, company finance, payouts, operations, workforce, customer, marketing | Unknown/unregistered Office routes |
| General Manager | Operational oversight, payout approvals, customers, workforce visibility, system health | Owner security/role administration, pricing/integration owner-only controls |
| Operations Administrator | Booking/team operations, operational customer contact, system health | Company finance, Owner security, marketing publishing |
| Finance Administrator | Full finance, invoices, reconciliation, payout preparation | Customer administration, cleaner sensitive documents unless separately granted, marketing publishing |
| Customer Care | Customers, bookings required for support, WhatsApp/customer replies | Cleaner administration, finance, Owner security, marketing publishing |
| Workforce Administrator | Cleaner applications, cleaner/team management, scheduling visibility | Finance, customer administration, Owner security, marketing publishing |
| Marketing Administrator | Blog drafting, campaign publishing review, marketing analytics/content | Customer PII administration, finance, cleaner administration, Owner security |
| Supervisor | Assigned-team schedule/bookings and team workflow only | Company-wide customers, finance, payouts, security, marketing, unrelated teams |

## My Work acceptance

- Finance: overdue invoices and approved-unbatched earnings only with their exact permissions.
- Workforce: pending cleaner applications only with `application.decide`.
- Customer Care: unanswered WhatsApp conversations only with `customer.contact`; phone is masked on the card and message body is not copied into My Work.
- Marketing: draft blog work only with `content.draft`; ready campaign work only with `content.publish`.
- Supervisor: must not receive Finance, Workforce, Customer Care or Marketing work items without those exact permissions.

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

## Final closeout

Priority 4 can be marked complete only when the Priority 4 CI gate is green and the eight staging role journeys above have been signed off. Production closeout should then include a seven-day review of authorization failures, sensitive-access audit events, role changes, exports and payout maker-checker events before the implementation plan is marked fully complete.
