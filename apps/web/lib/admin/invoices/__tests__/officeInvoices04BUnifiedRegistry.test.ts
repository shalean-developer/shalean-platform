import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("OFFICE-INVOICES-04B unified invoice registry", () => {
  it("unifies monthly, booking, sales invoice and quote rails in SQL", () => {
    const sql = readFileSync(
      join(
        root,
        "../../supabase/migrations/20261001194500_office_invoices_04b_unified_registry.sql",
      ),
      "utf8",
    );

    expect(sql).toContain("'monthly_invoice'::text as kind");
    expect(sql).toContain("'booking_invoice'::text as kind");
    expect(sql).toContain("then 'quote' else 'sales_invoice'");
    expect(sql).toContain("union all");
    expect(sql).toContain("select * from monthly_docs");
    expect(sql).toContain("select * from booking_docs");
    expect(sql).toContain("select * from sales_docs");
  });

  it("preserves website/admin booking origin", () => {
    const sql = readFileSync(
      join(
        root,
        "../../supabase/migrations/20261001194500_office_invoices_04b_unified_registry.sql",
      ),
      "utf8",
    );

    expect(sql).toContain("b.booking_source");
    expect(sql).toContain("when sd.source = 'customer_request' then 'website'");
  });

  it("excludes quotes from invoice money KPIs", () => {
    const sql = readFileSync(
      join(
        root,
        "../../supabase/migrations/20261001194500_office_invoices_04b_unified_registry.sql",
      ),
      "utf8",
    );

    expect(sql).toContain("count(*) filter (where is_invoice)::int as invoice_count");
    expect(sql).toContain("count(*) filter (where is_quote)::int as quote_count");
    expect(sql).toContain("sum(balance_cents) filter (");
    expect(sql).toContain("where is_invoice and status not in ('paid','refunded','void')");
    expect(sql).toContain("sum(amount_cents) filter (where is_invoice)");
  });

  it("keeps native detail/PDF routes for every document rail", () => {
    const sql = readFileSync(
      join(
        root,
        "../../supabase/migrations/20261001194500_office_invoices_04b_unified_registry.sql",
      ),
      "utf8",
    );

    expect(sql).toContain("'/office/invoices/' || mi.id::text");
    expect(sql).toContain("'/api/admin/invoices/' || mi.id::text || '/pdf'");
    expect(sql).toContain("'/office/bookings/' || b.id::text");
    expect(sql).toContain("'/api/admin/bookings/' || b.id::text || '/invoice-pdf'");
    expect(sql).toContain("'/office/sales-documents/' || sd.id::text");
    expect(sql).toContain("'/api/admin/sales-documents/' || sd.id::text || '/pdf'");
  });

  it("uses the registry endpoint and common Zoho sync action from /office/invoices", () => {
    const page = readFileSync(
      join(root, "app/(ui-redesign)/office/invoices/page.tsx"),
      "utf8",
    );

    expect(page).toContain('"/api/admin/invoice-registry"');
    expect(page).toContain('"/api/admin/billing-documents/sync"');
    expect(page).toContain("Website booking");
    expect(page).toContain("Admin booking");
    expect(page).toContain("All invoices");
    expect(page).toContain("Quotes");
    expect(page).toContain("row.pdf_href");
    expect(page).toContain("row.href");
  });

  it("keeps registry filtering and pagination in SQL", () => {
    const loader = readFileSync(
      join(root, "lib/admin/invoices/loadAdminInvoiceRegistry.ts"),
      "utf8",
    );

    expect(loader).toContain('admin.rpc("admin_invoice_registry_v1"');
    expect(loader).not.toContain(".from(");
    expect(loader).not.toContain(".filter(");
  });
});
