# CF-02 increment 3: protected-obligation source observations

Increment 2 is live on production b020810. Direct provider observations verified at 20:09 UTC: 13 successful transactions, R22,430 gross, R742.29 actual fees, selected provider payout-date total R19,956.66, current pending R2,126.22. Four exact-reference/imported-bank links total R18,311.52 by November bank dates, including a prior-period payout. Three paid payouts remain unmatched under the reference rule; full bank reconciliation stays open. No amount/date inference or financial write was made.

## Source proof and boundary

Read-only Zoho UI independently identified organisation 927500285, Funds Held for Bokkie account 253016000000482529 (Other Current Liability, closing R73,122.33 Cr) and Income Received in Advance account 253016000000005001 (Other Current Liability, closing R19,823.50 Cr). These observations establish mapping and book balances; they do not certify ownership allocations or the completeness of all outstanding obligations. The Bokkie bank balance is a separate asset and cannot substitute for, or be added to, its liability.

Official GET /chartofaccounts/{id} contract checked at https://www.zoho.com/books/api/v3/chart-of-accounts/. The documented response is at the root and includes account_id, account_type, currency_code, is_active and closing_balance. The reader requires exact ID/type/ZAR/active identity, preserves the API sign, and attaches only the successful read timestamp. No abs(), positive clamp, ledger changes or historical repair. One failed account read does not hide another. Staging/development are explicitly synthetic and perform no external finance reads; unknown environments/organisations fail closed.

The UI labels these as current signed Zoho closing balances, separate from the selected activity period and selected-period cleaner earnings. Older unpaid earnings, customer allocations, other payables/restrictions and overlaps still need reconciliation. The existing selected-period cleaner report is not used as an all-time payable certificate. The operating reserve remains a separate policy amount. No additive protected-cash total, spendable cash or runway is asserted from incomplete observations. Missing bank evidence does not block these book observations.

## Acceptance gates

Exact-head authorization, independent source failure, invalid identity/currency/balance, sign preservation, unavailable decisions and UI source/overlap regressions are required. Browser checks cover expanded source evidence and independent availability with missing bank balances at 390/768/1280. Canonical hosted staging and isolated production release/read-only comparison must follow; fixtures alone are not completion evidence. Account balances/sign/response shape must agree with the live Zoho UI before accepting the connection.

Financial obligations reconciliation and verified bank cash remain explicit open gates in #1051. The dashboard may show reliable book/provider observations while protected total, spendable cash and runway remain unavailable. No accounting records, financial transactions or integration credentials are changed by this increment.
