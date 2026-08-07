# Priority 4 Finance Queue UAT

After CI passes and the slice is deployed, verify with role-scoped accounts:

1. Finance Admin sees overdue invoice work when overdue balances exist.
2. Finance Admin with `payout.prepare` sees the payout-preparation work item when approved unbatched earnings exist.
3. A role with only `finance.summary.view` does not receive overdue invoice work.
4. A role with only `payout.view` does not receive payout-preparation work.
5. Supervisor does not receive either Finance item.
6. Opening each action lands on the existing invoices or payouts workspace without exposing extra permissions.
