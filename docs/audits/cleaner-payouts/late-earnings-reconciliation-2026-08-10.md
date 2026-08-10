# July 2026 cleaner payout late-earnings reconciliation

Production audit on 2026-08-10 found late eligible July earnings after cleaner payout rows had already been frozen into draft payout run `5147524e-0f65-4941-bd3a-aa1ad5504dd7`.

The remediation keeps the existing cleaner/period payout row canonical. While the generate-payouts lock is held, frozen payouts that belong to draft runs are temporarily moved back to pending and detached from the draft run. The existing generator appends newly eligible earnings. A finally block restores the payouts to the same draft run and recomputes the run total.

Approved and paid payout runs are excluded from automatic reopening.
