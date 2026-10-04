-- MASTER-00A staging ledger bridge.
-- Canonical schema change already lives in 20261001152000_office_invoices_01_financial_truth.sql.
-- Intentionally no-op; do not replay historical invoice reconciliation updates.
select 1;
