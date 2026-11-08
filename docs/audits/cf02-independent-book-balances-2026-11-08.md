# CF-02 increment 1: independent Zoho book balances

Owner accepted dashboard presentation/safeguards in #1051 and explicitly directed implementation, staging testing and release of accepted increments. CF-02 remains open. This increment changes only book/feed evidence independence; no ledger writes, balance sync, provider activation or financial corrections.

## Defect and source contract

Previously a missing/stale bank feed suppressed the four-account Zoho book total, even after successful independent reads of all four identified ZAR book balances. Keep book observations separate from bank-feed refresh and current/available basis. Both totals require all four unique mapped identities and safe integer amounts, but each now validates its own timestamp and completeness. Missing, stale, future, failed or duplicate book evidence cannot become zero or a complete book total. Bank comparison still requires both complete sources and explicitly current bank basis.

The existing GET-only production Zoho loader supplies bookReadAt on successful mapped-account responses. This records the application query observation time, not the bank's effective date or an independently reconciled historical cutoff. Feed timestamps retain their provider meaning. Staging/development remain synthetic, with no live finance reads. No new credentials, environment flags, third-party service or database schema.

## Intended behavior and verification

- Missing/stale feed: observed book total stays visible; bank total/difference and spendable/runway stay unavailable.
- Missing/stale/future book observation, mapping failure, invalid amount or duplicate identity: book total unavailable; no false zero or comparison.
- Unknown/available feed basis: no accounting difference inferred.
- Failed/loading page request: previous book values, account details and source time are hidden.
- Existing transfer neutrality, negative balances, synthetic isolation and protected-cash guards remain.

Validation: 13 executable Node model scenarios passed locally without network access. Expanded existing Vitest model/provider/UI suites and real Chromium browser checks at 390/768/1280 are submitted to CI; full validation is pending and must not be inferred from the local model run. Direct clone/dependency access was unavailable in this workspace; source is based on exact GitHub main 1a1b97da06569e6778610050f8190f8773c887a9.

## Release gates

Exact-head required CI, source review, staging bundle, guarded Plesk activation with rollback preservation and hosted book/feed separation checks must pass before production promotion. Production uses an isolated accepted source diff on the current production baseline, never an indiscriminate main release. No release has occurred at preparation time.

Follow only after this increment passes: provider receipts/actual fees/pending payouts, independent settlement-to-deposit membership and no double counting; then protected obligations and verified spendable/runway. Missing bank evidence blocks verification/spending decisions, not independently sourced accounting displays.
