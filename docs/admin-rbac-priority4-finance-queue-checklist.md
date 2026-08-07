# Priority 4 Finance Queue Verification Checklist

- [x] Finance queue uses existing production tables only.
- [x] Overdue invoices require `finance.full.view`.
- [x] Payout preparation requires `payout.prepare`.
- [x] Invoice items link to the existing invoice detail route.
- [x] Payout items link to the existing payouts workspace.
- [x] Central work-item policy rejects mismatched permission/href combinations.
- [x] Supervisor permissions cannot receive finance work items.
- [x] No finance mutations are added.
- [ ] CI green on pull request.
- [ ] Merge to `main` only after all required checks pass.
