# Admin RBAC Priority 4 — Finance My Work Queue

This slice adds permission-scoped Finance work items to the existing Office **My Work** feed.

## Included work items

- **Overdue monthly invoices**
  - Requires `finance.full.view`.
  - Reads only invoices marked overdue, still open, and with an outstanding balance.
  - Links directly to the existing `/office/invoices/:id` workspace.
- **Approved earnings ready for payout preparation**
  - Requires `payout.prepare`.
  - Includes only approved cleaner earnings that are not yet assigned to a disbursement.
  - Aggregates them into one actionable queue item linking to `/office/payouts`.

## Safety rules

- My Work still starts from the authenticated user's effective permission set.
- Each new work item is checked again through the central `OFFICE_WORK_ITEM_POLICIES` registry before it can be returned.
- `finance.summary.view` is intentionally insufficient for overdue invoice work items.
- `payout.view` is intentionally insufficient for payout preparation work items.
- Query failures do not broaden access or invent counts; the affected queue simply remains empty and the server records an error.
- No new finance mutation is introduced by this slice.

## Follow-up slices

Workforce, Customer Care, and Marketing queues should be added separately so each source, permission boundary, and workflow can be reviewed and tested independently.
