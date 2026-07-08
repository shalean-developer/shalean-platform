-- Human-readable Zoho Books document numbers (INV-…, EST-…) mirrored in Shalean
-- so office UIs can show the Zoho invoice/estimate number alongside Shalean ids.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS zoho_invoice_number text;

ALTER TABLE monthly_invoices
  ADD COLUMN IF NOT EXISTS zoho_invoice_number text;

ALTER TABLE sales_documents
  ADD COLUMN IF NOT EXISTS zoho_invoice_number text,
  ADD COLUMN IF NOT EXISTS zoho_estimate_number text;

CREATE INDEX IF NOT EXISTS idx_bookings_zoho_invoice_number
  ON bookings (zoho_invoice_number)
  WHERE zoho_invoice_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_monthly_invoices_zoho_invoice_number
  ON monthly_invoices (zoho_invoice_number)
  WHERE zoho_invoice_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_documents_zoho_invoice_number
  ON sales_documents (zoho_invoice_number)
  WHERE zoho_invoice_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_documents_zoho_estimate_number
  ON sales_documents (zoho_estimate_number)
  WHERE zoho_estimate_number IS NOT NULL;

COMMENT ON COLUMN bookings.zoho_invoice_number IS
  'Zoho Books invoice_number (e.g. INV-000123) for the linked zoho_invoice_id.';

COMMENT ON COLUMN monthly_invoices.zoho_invoice_number IS
  'Zoho Books invoice_number (e.g. INV-000123) for the linked zoho_invoice_id.';

COMMENT ON COLUMN sales_documents.zoho_invoice_number IS
  'Zoho Books invoice_number for sales invoices (document_type = invoice).';

COMMENT ON COLUMN sales_documents.zoho_estimate_number IS
  'Zoho Books estimate_number for quotes (document_type = quote).';
