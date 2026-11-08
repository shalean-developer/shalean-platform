# CF-02 increment 2: provider receipts, payouts and existing bank links

Increment 1 is deployed to production 0f881fec and its four book balances independently matched Zoho at R73,324.08. Owner requested implementation and release in separate tested increments. This increment is GET-only; no reconciliation job, accounting update, historical backfill, customer charge, refund, payout or transfer is invoked.

## Sources and basis

- Paystack successful transactions: all pages scanned before filtering by Johannesburg paid_at, avoiding an unproven created-date API filter. Actual minor-unit amount and fees only; missing fees remain unavailable. Gross captures are not net revenue, refunds or bank cash.
- Paystack settlements: effective_amount, exact integration 1019240 (live Shalean dashboard identity), domain live and ZAR. Provider-paid payout totals use provider settlement dates. Current pending/processing totals include all dates, including undated future payouts, independently of selected-period receipts. Failure does not become zero.
- Fixed provider snapshot is coalesced and cached in server memory for at most 60 seconds, separately labelled by observed time. Pagination metadata/unique IDs are verified; changed, missing or bounded-incomplete pages fail closed. No raw customer/card/authorization payload leaves the server.
- Existing Zoho bank links: mapped Income account only, complete bounded list scan around selected dates, exact numeric payout reference or the observed anchored PAYSTACK-PAYOUT-<id> reference, same destination/currency/net amount, matching immutable bank-transaction identity and an existing matched/categorized imported bank-line identity. A manually added entry, amount/date coincidence or provider-paid state alone never proves a deposit. Ambiguous duplicates remain unverified. The conservative seven-day posting window leaves unsupported late matches for review.
- Matched bank totals use imported bank dates, including prior-period provider payouts received in the selected bank period. Pending/provider-paid amounts are never added to bank/book totals. A matched subset is not complete statement reconciliation or proof of cash ownership.

Official contracts checked read-only: https://paystack.com/docs/api/transaction/ and https://paystack.com/docs/api/settlement/; https://www.zoho.com/books/api/v3/bank-transactions/. Response shape/identity must still be checked on deployed production; an unsupported bank link is unavailable, not estimated.

## Controls and validation

Permission payout.view checked before reads; authenticated GET endpoint is private/no-store. Invalid calendar dates, reversed or excessive ranges are rejected before provider requests. Staging/development are synthetic and make no external finance requests; unknown environments/wrong organisation/test secrets fail closed. Existing four-account guards, obligations, spendable cash and runway remain unchanged.

Local pure model execution passed positive/boundary/reference/currency-account/duplicate/unavailable cases without network. Expanded existing critical suite includes model, provider pagination/isolation/GET-only/matching, route 401/403 and UI retained-value/source disclosure tests. Real Chromium fixture includes the provider observation and retains mobile date/overflow/loading/error/period checks. Exact-head full CI, review, canonical staging verification and isolated production-target release/reconciliation are still mandatory. No completion claim follows from fixtures alone.

Later protected-obligation increment remains separate. Financial reconciliation and audit #1051 stay OPEN while source links or protected-cash evidence are unresolved.
