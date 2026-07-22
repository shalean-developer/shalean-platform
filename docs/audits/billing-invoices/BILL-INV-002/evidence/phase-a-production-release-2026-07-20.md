# BILL-INV-002 Phase A — Production release evidence

| Field | Value |
|-------|-------|
| **Activity** | Merge PR #74 to `main` / production deploy — Phase A only |
| **Authorization (UTC)** | `2026-07-20T20:29:00Z` (operator explicit approval) |
| **Merged at (UTC)** | `2026-07-20T20:31:49Z` |
| **Merge commit** | `f5319b77cd3b74a13afc32891814a083cce6db36` |
| **Feature tip** | `45ed53b09fbf066182ed8080d88f21fc4a297e65` |
| **PR** | https://github.com/shalean-developer/shalean-platform/pull/74 |
| **Mode** | Production app deploy only |

## Authorization scope (binding)

Approved:

- Merge PR #74 to `main`
- Production Vercel deploy of Phase A payment-amount integrity controls

Explicitly **not** authorized / not performed:

- Ledger backfill (9 paid-without-ledger)
- `accounting-sync` cron activation
- Customer communication
- Full staging Paystack live matrix closure (accepted incomplete)

## Controls shipped to production

- Charge ≠ remaining balance → quarantine (`amount_mismatch_quarantined`); no settle/ledger
- Balance-bound Paystack refs (`_b{cents}`); stale-link clear + cleared-link ref rotation
- Adjustments clear `payment_link`
- Branded `/pay/invoice` URLs for admin copy / customer pay
- Multi-charge refund blocked (`multi_charge_refund_unsupported`)

## Gate note

Sponsor accepted promotion without closed staging Paystack E2E evidence. Operating exception remains: do not treat balance-changed stale Paystack sessions as safe for customer payment; rely on Phase A software controls.

## Production deploy

| Item | Value |
|------|-------|
| `main` merge SHA | `f5319b77cd3b74a13afc32891814a083cce6db36` |
| Vercel deployment | `dpl_BqkjvGuPck86FvxCLBWFEbWwvi9q` |
| Deployment URL | `https://shalean-platform-b212it0e8-shalean-cleaning-services.vercel.app` |
| Target | **Production** · **READY** |
| Aliases | `https://shalean.co.za`, `https://www.shalean.co.za` |
| Health | `GET https://shalean.co.za/api/health/environment` → `ok`, `gitBranch=main`, `gitSha=f5319b77…`, Paystack **live** |
| Commit status | Vercel **success** for merge SHA |

## Explicit non-actions

| Action | Status |
|--------|--------|
| Ledger backfill | **Not performed** |
| `accounting-sync` activation | **Not performed** |
| Customer communication | **Not performed** |
