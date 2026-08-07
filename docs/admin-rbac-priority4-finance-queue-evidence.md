# Priority 4 Finance Queue Source Evidence

The Finance My Work slice is intentionally narrow and uses existing production sources already present in the Shalean platform.

- `monthly_invoices`: overdue/open/outstanding invoice state.
- `cleaner_earnings`: approved earnings with no `disbursement_id` are ready for payout preparation.

At implementation time, production contained overdue monthly invoices and approved unbatched cleaner earnings, confirming these are live operational queues rather than placeholder dashboard cards.

Exact live counts are deliberately not hard-coded into the application or this evidence file because they change continuously.
