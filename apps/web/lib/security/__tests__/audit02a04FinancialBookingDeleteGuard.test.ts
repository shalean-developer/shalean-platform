import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("AUDIT-02A04 financial booking hard-delete guard", () => {
  it("blocks direct DB deletion when durable financial truth exists", () => {
    const sql = read("../../supabase/migrations/20261011080000_audit_02a04_financial_booking_delete_guard.sql");

    expect(sql).toContain("before delete on public.bookings");
    expect(sql).toContain("booking_delete_blocked_financial_history");
    expect(sql).toContain("old.payment_transaction_id is not null");
    expect(sql).toContain("from public.payment_transactions pt");
    expect(sql).toContain("pt.booking_id = old.id");
    expect(sql).toContain("pt.entity_type = 'booking' and pt.entity_id = old.id");
    expect(sql).toContain("from public.expenses e");
    expect(sql).toContain("e.booking_id = old.id");
    expect(sql).toContain("coalesce(old.amount_paid_cents, 0) > 0");
    expect(sql).toContain("coalesce(old.total_paid_cents, 0) > 0");
    expect(sql).toContain("coalesce(old.total_paid_zar, 0) > 0");
    expect(sql).toContain("old.monthly_invoice_id is not null");
    expect(sql).toContain("old.sales_document_id is not null");
    expect(sql).toContain("old.payout_id is not null");
  });

  it("keeps the sales-document cleanup inside one database transaction boundary", () => {
    const sql = read("../../supabase/migrations/20261011080000_audit_02a04_financial_booking_delete_guard.sql");

    expect(sql).toContain("function public.delete_unpaid_sales_document_booking");
    expect(sql).toContain("for update");
    expect(sql).toContain("update public.bookings");
    expect(sql).toContain("set sales_document_id = null");
    expect(sql).toContain("delete from public.bookings where id = v.id");
    expect(sql.indexOf("set sales_document_id = null")).toBeLessThan(
      sql.indexOf("delete from public.bookings where id = v.id"),
    );
  });

  it("keeps unpaid financially-unlinked cleanup rows outside the block predicate", () => {
    const sql = read("../../supabase/migrations/20261011080000_audit_02a04_financial_booking_delete_guard.sql");

    expect(sql).not.toContain("old.status = 'payment_expired'");
    expect(sql).not.toContain("old.is_test");
  });
});
