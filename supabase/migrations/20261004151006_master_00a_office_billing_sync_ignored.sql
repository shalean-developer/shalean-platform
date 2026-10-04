-- MASTER-00A staging ledger bridge.
-- Canonical schema change already lives in 20261001143000_office_billing_e2e09_invoice_sync_ignored.sql.
-- Intentionally no-op so repository migration history matches the governed staging ledger without replaying financial mutations.
select 1;
