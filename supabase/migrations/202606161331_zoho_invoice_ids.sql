-- Zoho Books invoice ID tracking
-- Stores the Zoho Books invoice ID on both monthly invoices and per-booking invoices
-- so the system can record payments against the correct Zoho invoice.

ALTER TABLE monthly_invoices
  ADD COLUMN IF NOT EXISTS zoho_invoice_id text;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS zoho_invoice_id text;

-- Sparse indexes — most rows will have NULL; only synced rows need fast lookup
CREATE INDEX IF NOT EXISTS idx_monthly_invoices_zoho_invoice_id
  ON monthly_invoices (zoho_invoice_id)
  WHERE zoho_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_zoho_invoice_id
  ON bookings (zoho_invoice_id)
  WHERE zoho_invoice_id IS NOT NULL;

COMMENT ON COLUMN monthly_invoices.zoho_invoice_id IS
  'Zoho Books invoice ID synced at finalization. NULL until synced.';

COMMENT ON COLUMN bookings.zoho_invoice_id IS
  'Zoho Books invoice ID synced at per-booking payment (charge.success webhook). NULL until synced.';
