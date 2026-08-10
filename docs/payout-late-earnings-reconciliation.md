# Late earnings reconciliation for monthly cleaner payouts

When a cleaner payout is already frozen but its payout run is still in `draft`, the payout-generation lock may safely reopen that canonical cleaner/period payout for the duration of catch-up generation. Newly eligible earnings are appended by the existing payout generator, after which the payout is restored to its original draft run and the run total is recomputed.

Safety boundary:

- `draft` payout runs: eligible for automatic reconciliation.
- `approved` or `paid` payout runs: never reopened or mutated by this flow.
- the existing cleaner/period payout row is reused, so the active-period unique constraint continues to prevent duplicate payouts.
- manual and scheduled payout generation use the same cron lock and the same reconciliation helper.
