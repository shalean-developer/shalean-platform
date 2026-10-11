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
    expect(sql).toContain("from public.cleaning_credit_transactions cct");
    expect(sql).toContain("cct.booking_id = old.id");
    expect(sql).toContain("from public.cleaner_earnings ce");
    expect(sql).toContain("('approved', 'processing', 'paid')");
    expect(sql).toContain("from public.cleaner_earnings_adjustments cea");
    expect(sql).toContain("from public.team_job_member_payouts tjmp");
    expect(sql).toContain("from public.booking_roster_member_payouts brmp");
    expect(sql).toContain("coalesce(old.amount_paid_cents, 0) > 0");
    expect(sql).toContain("coalesce(old.total_paid_cents, 0) > 0");
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

  it("preflights child financial ledgers in the admin route for structured blocking", () => {
    const src = read("app/api/admin/bookings/[id]/route.ts");

    expect(src).toContain('.from("payment_transactions")');
    expect(src).toContain("booking_id.eq.");
    expect(src).toContain("entity_type.eq.booking");
    expect(src).toContain('.from("expenses")');
    expect(src).toContain('.from("cleaner_earnings")');
    expect(src).toContain('["approved", "processing", "paid"]');
    expect(src).toContain('.from("cleaner_earnings_adjustments")');
    expect(src).toContain('.from("cleaning_credit_transactions")');
    expect(src).toContain("payment_transaction_id: r.payment_transaction_id ?? linkedPayment?.id ?? null");
    expect(src).toContain("linked_cleaning_credit_transaction_id: linkedCleaningCreditTransaction?.id ?? null");
  });

  it("keeps protected rows from aborting the batch purge", () => {
    const sql = read("../../supabase/migrations/20261011080000_audit_02a04_financial_booking_delete_guard.sql");

    expect(sql).toContain("v_financially_protected bigint := 0");
    expect(sql).toContain("for r in");
    expect(sql).toContain("when check_violation then");
    expect(sql).toContain("v_financially_protected := v_financially_protected + 1");
    expect(sql).toContain("and status = 'pending_payment'");
    expect(sql).toContain("and created_at < now() - interval '2 hours'");
    expect(sql).toContain("and coalesce(is_recurring_generated, false) = false");
  });

  it("does not treat overloaded quoted total_paid_zar as standalone proof of payment", () => {
    const sql = read("../../supabase/migrations/20261011080000_audit_02a04_financial_booking_delete_guard.sql");

    expect(sql).not.toContain("coalesce(old.total_paid_zar, 0) > 0");
    expect(sql).not.toContain("coalesce(v.total_paid_zar, 0) > 0");
  });

  it("keeps unpaid financially-unlinked cleanup rows outside the block predicate", () => {
    const sql = read("../../supabase/migrations/20261011080000_audit_02a04_financial_booking_delete_guard.sql");

    expect(sql).not.toContain("old.status = 'payment_expired'");
    expect(sql).not.toContain("old.is_test");
  });
});
