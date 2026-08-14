# Admin RBAC Priority 4 — route visibility correction

This change keeps RBAC grants unchanged and aligns Office route audiences with the live role model.

- Supervisor no longer sees the unscoped Inventory route.
- General Manager no longer sees full-finance-only routes it cannot authorize.
- Payout approval remains Owner-only under the current live grants.
- Summary-finance routes remain available to General Manager.

Server-side authorization remains fail-closed and unchanged.
