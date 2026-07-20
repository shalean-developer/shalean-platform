# 18 — Verification Matrix

| ID | Verification criterion | Staging | Prod read-only | Prod write |
|----|------------------------|---------|----------------|------------|
| C01 | Drifted balance cannot complete stale amount; or auto-refresh | Required | Amount probes | After fix |
| H01 | Every paid monthly has ledger or explicit manual channel | Backfill dry-run | Count=0 gap | Backfill |
| H02 | Multi-charge refund blocked or completes all | Test fixtures | multi=0 today | — |
| H03 | Copied URL host = shalean.co.za `/pay/invoice` | UI test | — | — |
| H04 | `accounting_sync_records` pending age decreases | Cron fire | Pending trend | Schedule |
| H05 | `cron_runs` rows for reminders/overdue/drift daily | Force invoke | Count>0 | Fix invoke |
| H06 | Adjustment nulls payment_link | Unit + staging | — | — |
| M01 | Export works or control removed | UI | — | — |
| M08/M09 | Status/email and success copy accurate | E2E | — | — |
| Settlement | Invariant SQL A–E empty | — | Re-run probes | — |
| Security | Wrong ref 403; no ref incomplete | Browser | Done | — |
| Paystack | Live mode unchanged; no test charges in prod | — | Health endpoint | Forbidden |

## Exit criteria for PASS upgrade

1. C01 + H06 fixed and verified on staging  
2. H01 gap closed or explicitly classified with manual ledger rows  
3. H05 reminder/overdue produce successful `cron_runs` for 7 consecutive days  
4. H04 accounting queue draining  
5. H02 stopgap or full fix merged  
6. Re-audit scores ≥ 80 across integrity, links, reconciliation, ops
