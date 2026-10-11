import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("AUDIT-02A04 financial booking hard-delete guard", () => {
  it("blocks direct DB deletion when durable financial truth exists", () => {
    const sql = read("../../supabase/migrations/20261011080000_audit_02a04_financial_booking_delete_guard.sql");

    expect(sql).toContain("before delete on public.bookings");
    expect(sql).toContain("booking_delete_blocked_financial_history");
    expect(sql).toContain("lower(trim(coalesce(old.status, ''))) = 'completed'");
    expect(sql).toContain("old.completed_at is not null");
    expect(sql).toContain("old.cleaner_line_earnings_finalized_at is not null");
    expect(sql).toContain("old.marked_paid_by_admin_id is not null");
    expect(sql).toContain("old.zoho_invoice_id is not null");
    expect(sql).toContain("old.refunded_at is not null");
    expect(sql).toContain("old.refund_status");
    expect(sql).toContain("old.payout_paid_at is not null");
    expect(sql).toContain("old.payout_run_id is not null");
    expect(sql).toContain("pending_monthly");
    expect(sql).toContain("old.is_monthly_billing_booking");
    expect(sql).toContain("from public.payout_audit_events pae");
    expect(sql).toContain("old.id = any");
    expect(sql).toContain("old.payment_transaction_id is not null");
    expect(sql).toContain("old.payment_reference_external");
    expect(sql).toContain("from public.payment_transactions pt");
    expect(sql).toContain("pt.booking_id = old.id");
    expect(sql).toContain("pt.entity_type = 'booking' and pt.entity_id = old.id");
    expect(sql).toContain("from public.expenses e");
    expect(sql).toContain("from public.inventory_movements im");
    expect(sql).toContain("from public.transport_cost_entries tce");
    expect(sql).toContain("from public.booking_cleaner_earnings_snapshot bces");
    expect(sql).toContain("from public.booking_cleaner_earnings_snapshot_lines bcesl");
    expect(sql).toContain("from public.booking_line_items bli");
    expect(sql).toContain("coalesce(bli.cleaner_earnings_cents, 0) > 0");
    expect(sql).toContain("e.booking_id = old.id");
    expect(sql).toContain("from public.cleaning_credit_transactions cct");
    expect(sql).toContain("cct.booking_id = old.id");
    expect(sql).toContain("from public.invoice_adjustments ia");
    expect(sql).toContain("ia.booking_id = old.id");
    expect(sql).toContain("from public.refund_accounting_records rar");
    expect(sql).toContain("rar.entity_type = 'booking'");
    expect(sql).toContain("rar.entity_id = old.id");
    expect(sql).toContain("from public.referral_discount_redemptions rdr");
    expect(sql).toContain("rdr.booking_id = old.id");
    expect(sql).toContain("from public.referral_events re");
    expect(sql).toContain("re.booking_id = old.id");
    expect(sql).toContain("from public.accounting_invoice_sync ais");
    expect(sql).toContain("from public.accounting_sync_records asr");
    expect(sql).toContain("from public.admin_money_action_proposals amap");
    expect(sql).toContain("amap.booking_id = old.id");
    expect(sql).toContain("from public.admin_earnings_actions aea");
    expect(sql).toContain("from public.booking_changes bc");
    expect(sql).toContain("from public.growth_action_outcomes gao");
    expect(sql).toContain("from public.conversion_experiment_results cer");
    expect(sql).toContain("from public.email_campaign_attributions eca");
    expect(sql).toContain("aea.booking_id = old.id");
    expect(sql).toContain("from public.promotion_redemptions prd");
    expect(sql).toContain("prd.booking_id = old.id");
    expect(sql).toContain("from public.cleaner_earnings ce");
    expect(sql).toContain("from public.cleaner_earnings_adjustments cea");
    expect(sql).toContain("from public.cleaner_earnings_disputes ced");
    expect(sql).toContain("from public.team_job_member_payouts tjmp");
    expect(sql).toContain("from public.booking_roster_member_payouts brmp");
    expect(sql).toContain("coalesce(old.amount_paid_cents, 0) > 0");
    expect(sql).toContain("coalesce(old.deposit_paid_cents, 0) > 0");
    expect(sql).toContain("coalesce(old.cleaner_payout_cents, 0) > 0");
    expect(sql).toContain("coalesce(old.cleaner_bonus_cents, 0) > 0");
    expect(sql).toContain("coalesce(old.payout_earnings_cents, 0) > 0");
    expect(sql).toContain("coalesce(old.cleaner_earnings_total_cents, 0) > 0");
    expect(sql).toContain("coalesce(old.internal_earnings_cents, 0) > 0");
    expect(sql).toContain("coalesce(old.total_paid_cents, 0) > 0");
    expect(sql).toContain("coalesce(old.total_paid_zar, 0) > 0");
    expect(sql).toContain("old.monthly_invoice_id is not null");
    expect(sql).toContain("old.sales_document_id is not null");
    expect(sql).toContain("old.payout_id is not null");
  });

  it("keeps homepage widget quotes out of collected cash", () => {
    const src = read("lib/booking/insertWidgetServerBooking.ts");

    expect(src).toContain("total_paid_zar: 0");
    expect(src).toContain("total_price: totalPaidZar");
  });

  it("cleans retained cancelled sales-document provisional rows before retry", () => {
    const src = read("lib/salesDocument/createBookingFromSalesQuoteInvoice.ts");

    expect(src).toContain('select("id, status, metadata")');
    expect(src).toContain("retainedCancelledBookingId");
    expect(src).toContain("isSalesDocumentLineItemRollbackMarker");
    expect(src).toContain('"delete_unpaid_sales_document_booking"');
    expect(src).toContain("cancelled_booking_cleanup_failed");
  });

  it("repairs retained paid sales-document bookings after line-item failure", () => {
    const src = read("lib/salesDocument/createBookingFromSalesQuoteInvoice.ts");

    expect(src).toContain("retainedCancelledBookingId");
    expect(src).toContain("buildExactSourceLineItems");
    expect(src).toContain('"repair_paid_cancelled_sales_document_booking"');
    expect(src).toContain("p_line_items: repairItems");
    expect(src).toContain("paid_cancelled_booking_repair_failed");
  });

  it("repairs paid sales-document lines atomically in the database", () => {
    const sql = read("../../supabase/migrations/20261011080000_audit_02a04_financial_booking_delete_guard.sql");

    expect(sql).toContain("function public.repair_paid_cancelled_sales_document_booking");
    expect(sql).toContain("for update");
    expect(sql).toContain("not_provisional_line_item_rollback");
    expect(sql).toContain("audit02a04_provisional_rollback");
    expect(sql).toContain("delete from public.booking_line_items where booking_id = v.id");
    expect(sql).toContain("insert into public.booking_line_items");
    expect(sql).toContain("set status = 'pending'");
  });

  it("keeps sales-document unpaid totals out of collected-cash fields", () => {
    const src = read("lib/salesDocument/createBookingFromSalesQuoteInvoice.ts");

    expect(src).toContain("const collectedTotalZar = invoicePaid ? quotedTotalZar : 0");
    expect(src).toContain("total_paid_zar: collectedTotalZar");
    expect(src).toContain("total_price: quotedTotalZar");
    expect(src).toContain("declaredTotalCents: quotedTotalZar * 100");
  });

  it("allows ordinary unpaid invoice bookings through the atomic cleanup boundary", () => {
    const sql = read("../../supabase/migrations/20261011080000_audit_02a04_financial_booking_delete_guard.sql");

    expect(sql).toContain("not in ('pending_payment', 'pending', 'cancelled')");
    expect(sql).toContain("booking_not_unpaid_deletable_state");
    expect(sql).toContain("lower(trim(coalesce(v.status, ''))) = 'cancelled'");
    expect(sql).toContain("not_provisional_line_item_rollback");
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
    expect(src).toContain('.from("inventory_movements")');
    expect(src).toContain('.from("transport_cost_entries")');
    expect(src).toContain('.from("booking_cleaner_earnings_snapshot")');
    expect(src).toContain('.from("booking_cleaner_earnings_snapshot_lines")');
    expect(src).toContain('.from("booking_line_items")');
    expect(src).toContain('.from("cleaner_earnings")');
    expect(src).toContain('.from("cleaner_earnings_adjustments")');
    expect(src).toContain('.from("cleaner_earnings_disputes")');
    expect(src).toContain('.from("cleaning_credit_transactions")');
    expect(src).toContain('.from("invoice_adjustments")');
    expect(src).toContain('.from("refund_accounting_records")');
    expect(src).toContain('.from("referral_discount_redemptions")');
    expect(src).toContain('.from("referral_events")');
    expect(src).toContain('.from("accounting_invoice_sync")');
    expect(src).toContain('.from("accounting_sync_records")');
    expect(src).toContain('.from("admin_money_action_proposals")');
    expect(src).toContain('.from("admin_earnings_actions")');
    expect(src).toContain('.from("booking_changes")');
    expect(src).toContain('.from("growth_action_outcomes")');
    expect(src).toContain('.from("conversion_experiment_results")');
    expect(src).toContain('.from("email_campaign_attributions")');
    expect(src).toContain('.from("promotion_redemptions")');
    expect(src).toContain("payment_transaction_id: r.payment_transaction_id ?? linkedPayment?.id ?? null");
    expect(src).toContain("linked_cleaning_credit_transaction_id: linkedCleaningCreditTransaction?.id ?? null");
    expect(src).toContain("linked_invoice_adjustment_id: linkedInvoiceAdjustment?.id ?? null");
    expect(src).toContain("linked_refund_record_id: linkedRefundRecord?.id ?? null");
    expect(src).toContain("linked_referral_redemption_id: linkedReferralRedemption?.id ?? null");
    expect(src).toContain("linked_referral_event_id: linkedReferralEvent?.id ?? null");
    expect(src).toContain("linked_accounting_invoice_sync_id: linkedAccountingInvoiceSync?.id ?? null");
    expect(src).toContain("linked_accounting_sync_id: linkedAccountingSync?.id ?? null");
    expect(src).toContain("linked_money_proposal_id: linkedMoneyProposal?.id ?? null");
    expect(src).toContain("linked_earnings_action_id: linkedEarningsAction?.id ?? null");
    expect(src).toContain("linked_booking_change_id: linkedBookingChange?.id ?? null");
    expect(src).toContain("linked_growth_attribution_id: linkedGrowthAttribution?.id ?? null");
    expect(src).toContain("linked_conversion_attribution_id: linkedConversionAttribution?.id ?? null");
    expect(src).toContain("linked_email_attribution_id: linkedEmailAttribution?.id ?? null");
    expect(src).toContain("linked_promotion_redemption_id: linkedPromotionRedemption?.id ?? null");
    expect(src).toContain("marked_paid_by_admin_id");
    expect(src).toContain("refunded_at");
    expect(src).toContain("refund_status");
    expect(src).toContain("payout_paid_at");
    expect(src).toContain("payout_run_id");
    expect(src).toContain("cleaner_earnings_total_cents");
    expect(src).toContain("internal_earnings_cents");
    expect(src).toContain("completed_at");
    expect(src).toContain("linked_earnings_snapshot_line_id: linkedEarningsSnapshotLine?.id ?? null");
    expect(src).toContain("linked_cleaner_earnings_dispute_id: linkedCleanerDispute?.id ?? null");
  });

  it("uses valid dollar quoting for the non-promotion financial-history helper", () => {
    const sql = read("../../supabase/migrations/20261011080000_audit_02a04_financial_booking_delete_guard.sql");
    const helperStart = sql.indexOf("create or replace function public.booking_has_nonpromotion_financial_history");
    const helperEnd = sql.indexOf("revoke all on function public.booking_has_nonpromotion_financial_history", helperStart);
    const helper = sql.slice(helperStart, helperEnd);

    expect(helper).toContain("as $");
    expect(helper).toContain("$;");
    expect(helper).not.toContain("\nas $\n");
  });

  it("checks durable non-promotion financial history before reversing stale promotions", () => {
    const sql = read("../../supabase/migrations/20261011080000_audit_02a04_financial_booking_delete_guard.sql");

    expect(sql).toContain("function public.booking_has_nonpromotion_financial_history");
    expect(sql).toContain("if public.booking_has_nonpromotion_financial_history(r.id) then");
    expect(sql.indexOf("if public.booking_has_nonpromotion_financial_history(r.id) then")).toBeLessThan(
      sql.indexOf("Applied promotions are financial eligibility state"),
    );
    expect(sql).toContain("from public.payment_transactions pt");
    expect(sql).toContain("coalesce(b.deposit_paid_cents, 0) > 0");
    expect(sql).toContain("coalesce(b.total_paid_zar, 0) > 0");
    expect(sql).toContain("b.payment_reference_external");
    expect(sql).toContain("b.completed_at is not null");
    expect(sql).toContain("b.cleaner_line_earnings_finalized_at is not null");
    expect(sql).toContain("from public.booking_cleaner_earnings_snapshot_lines bcesl");
    expect(sql).toContain("from public.booking_line_items bli");
  });

  it("uses valid tagged quoting for the seed Cleaning Credit reset helper", () => {
    const sql = read("../../supabase/migrations/20261011080000_audit_02a04_financial_booking_delete_guard.sql");
    const start = sql.indexOf("create or replace function public.reset_seed_cleaning_credit_for_booking");
    const end = sql.indexOf("revoke all on function public.reset_seed_cleaning_credit_for_booking", start);
    const helper = sql.slice(start, end);

    expect(helper).toContain("as $seed_credit_reset$");
    expect(helper).toContain("$seed_credit_reset$;");
  });

  it("preflights every stale-purge redemption before mutating promotion state", () => {
    const sql = read("../../supabase/migrations/20261011080000_audit_02a04_financial_booking_delete_guard.sql");
    const purgeStart = sql.indexOf("create or replace function public.purge_stale_pending_payment_bookings");
    const purgeEnd = sql.indexOf("revoke all on function public.purge_stale_pending_payment_bookings", purgeStart);
    const purge = sql.slice(purgeStart, purgeEnd);

    expect(purge).toContain("Validate every applied redemption before mutating any of them");
    expect(purge).toContain("v_promotion_revenue_unproven := exists (");
    expect(purge).toContain("jsonb_typeof(pr.metadata -> 'bookingRevenueZar') is distinct from 'number'");
    expect(purge).toContain("counterIncrementCommitted");
    expect(purge.indexOf("v_promotion_revenue_unproven := exists (")).toBeLessThan(
      purge.indexOf("update public.promotion_redemptions"),
    );
  });

  it("reverses stale-purge promotion revenue from immutable redemption metadata", () => {
    const sql = read("../../supabase/migrations/20261011080000_audit_02a04_financial_booking_delete_guard.sql");
    const purgeStart = sql.indexOf("create or replace function public.purge_stale_pending_payment_bookings");
    const purgeEnd = sql.indexOf("revoke all on function public.purge_stale_pending_payment_bookings", purgeStart);
    const purge = sql.slice(purgeStart, purgeEnd);

    expect(purge).toContain("v_redemption.metadata ->> 'bookingRevenueZar'");
    expect(purge).toContain("v_promotion_revenue_unproven");
    expect(purge).toContain("single legacy row without original revenue evidence retains the");
    expect(purge).not.toContain("v_booking_revenue_zar := greatest(coalesce(v_total_price, 0), 0)");
  });

  it("keeps protected rows from aborting the batch purge", () => {
    const sql = read("../../supabase/migrations/20261011080000_audit_02a04_financial_booking_delete_guard.sql");

    expect(sql).toContain("v_financially_protected bigint := 0");
    expect(sql).toContain("for r in");
    expect(sql).toContain("when check_violation then");
    expect(sql).toContain("v_financially_protected := v_financially_protected + 1");
    expect(sql).toContain("when foreign_key_violation then");
    expect(sql).toContain("v_fk_protected := v_fk_protected + 1");
    expect(sql).toContain("from public.promotion_redemptions");
    expect(sql).toContain("set status = 'reversed'");
    expect(sql).toContain("redemptions_count = greatest(0");
    expect(sql).toContain("budget_spent_zar = greatest(0");
    expect(sql).toContain("revenue_generated_zar = greatest(0");
    expect(sql).toContain("for update");
    expect(sql).toContain("v_status is distinct from 'pending_payment'");
    expect(sql).toContain("v_created_at >= now() - interval '2 hours'");
    expect(sql).toContain("v_is_recurring");
    expect(sql).toContain("set status = 'payment_expired'");
    expect(sql).toContain("and status = 'pending_payment'");
    expect(sql).toContain("and created_at < now() - interval '2 hours'");
    expect(sql).toContain("and coalesce(is_recurring_generated, false) = false");
  });

  it("does not treat overloaded quoted total_paid_zar as standalone proof of payment", () => {
    const sql = read("../../supabase/migrations/20261011080000_audit_02a04_financial_booking_delete_guard.sql");

    expect(sql).toContain("coalesce(old.total_paid_zar, 0) > 0");
    expect(sql).toContain("coalesce(v.total_paid_zar, 0) > 0");
  });

  it("accepts an intentional zero-winner race rejection", () => {
    const wrapper = read("lib/admin/adminBookingPostInsertRace.ts");
    const route = read("app/api/admin/bookings/route.ts");

    expect(wrapper).toContain("winnerId: string | null");
    expect(wrapper).toContain('if (action === "reject")');
    expect(route).toContain("if (!winnerCreated && race.winnerId)");
    expect(route).toContain("because the race no longer has an active winner");
  });

  it("rejects a retained inactive monthly requester when no active winner remains", () => {
    const sql = read("../../supabase/migrations/20261011080000_audit_02a04_financial_booking_delete_guard.sql");

    expect(sql).toContain("if v_active_count = 0 then");
    expect(sql).toContain("if v_our_exists then");
    expect(sql).toContain("'action', 'reject'");
    expect(sql).toContain("'rolled_back_self', true");
  });

  it("rejects a retained cancelled monthly requester when the sole active winner differs", () => {
    const sql = read("../../supabase/migrations/20261011080000_audit_02a04_financial_booking_delete_guard.sql");

    expect(sql).toContain("if p_our_id is distinct from v_winner then");
    expect(sql).toContain("'action', 'reject'");
    expect(sql).toContain("'rolled_back_self', true");
  });

  it("monthly duplicate resolver cancels losers instead of hard deleting financial-flow rows", () => {
    const sql = read("../../supabase/migrations/20261011080000_audit_02a04_financial_booking_delete_guard.sql");

    expect(sql).toContain("AUDIT-02A04: serializes monthly duplicate races");
    expect(sql).toContain("set status = 'cancelled'");
    expect(sql).toContain("if p_our_id = any(v_deleted)");
  });

  it("retains provisional unified rows as cancelled with an explicit rollback marker when line-item persistence fails", () => {
    const src = read("lib/booking/createBookingUnified.ts");

    expect(src).toContain('status: "cancelled"');
    expect(src).toContain("audit02a04_provisional_rollback");
    expect(src).toContain('kind: "line_item_persist_failed"');
    expect(src).toContain("source: args.source");
    expect(src).toContain("rollback_failed:");
    expect(src).not.toContain('admin.from("bookings").delete().eq("id", id)');
  });

  it("does not treat legitimate cancelled sales-document bookings as rollback remnants", () => {
    const src = read("lib/salesDocument/createBookingFromSalesQuoteInvoice.ts");
    const sql = read("../../supabase/migrations/20261011080000_audit_02a04_financial_booking_delete_guard.sql");

    expect(src).toContain("isSalesDocumentLineItemRollbackMarker(existingBooking.metadata)");
    expect(sql).toContain("not_provisional_line_item_rollback");
    expect(sql).toContain("audit02a04_provisional_rollback");
  });

  it("keeps active non-production resets compatible without deleting financial history", () => {
    const env03 = read("../../scripts/env/seed-nonprod.mjs");
    const uat = read("../../scripts/env/seed-uat-booking-fixtures.mjs");
    const sql = read("../../supabase/migrations/20261011080000_audit_02a04_financial_booking_delete_guard.sql");

    expect(sql).toContain("function public.booking_has_financial_history");
    expect(sql).toContain("from public.promotion_redemptions pr");

    for (const src of [env03, uat]) {
      expect(src).toContain("retainedFinancial");
      expect(src).toContain('"booking_has_financial_history"');
      expect(src).toContain("p_booking_id: row.id");
      expect(src).toContain("historyError");
      expect(src).not.toContain('"booking_has_nonpromotion_financial_history"');
    }
    expect(uat).toContain("Conflict booking retained unchanged");
    expect(uat).toContain('"booking_has_financial_history"');
    expect(uat).toContain("conflict booking financial-history probe");
    expect(env03).toContain("retainedReferences.add(row.paystack_reference)");
    expect(env03).toContain("retainedReferences.has(row.paystack_reference)");
    expect(env03).toContain("retained financial fixture left unchanged");
  });

  it("clears completed_at only inside the governed seed reset before hard delete", () => {
    const seed = read("../../scripts/seed-dev.mjs");

    expect(seed).toContain('"neutralize seed booking financial mirrors"');
    expect(seed).toContain("completed_at: null");
    expect(seed).toContain("cleaner_line_earnings_finalized_at: null");
  });

  it("provides a guarded rollback for an unclaimed recurring prepaid occurrence", () => {
    const sql = read("../../supabase/migrations/20261011080000_audit_02a04_financial_booking_delete_guard.sql");
    const src = read("lib/recurring/insertRecurringOccurrenceBooking.ts");

    expect(sql).toContain("function public.rollback_unclaimed_recurring_prepaid_booking");
    expect(sql).toContain("provisional_booking_identity_mismatch");
    expect(sql).toContain("allocation_not_unclaimed");
    expect(sql).toContain("to_regclass('public.recurring_prepaid_allocations')");
    expect(sql).toContain("payment_completed_at = null");
    expect(src).toContain('admin.rpc(\n        "rollback_unclaimed_recurring_prepaid_booking"');
    expect(src).toContain("p_allocation_id: prepaidAllocation.allocationId");
    expect(src).toContain("rollback_failed:");
  });

  it("preserves pending cleaner earnings rows as durable financial history", () => {
    const sql = read("../../supabase/migrations/20261011080000_audit_02a04_financial_booking_delete_guard.sql");
    const src = read("app/api/admin/bookings/[id]/route.ts");

    expect(sql).toContain("from public.cleaner_earnings ce");
    expect(sql).toContain("where ce.booking_id = old.id");
    expect(sql).not.toContain("ce.status, ''))) in ('approved', 'processing', 'paid')");
    expect(src).toContain('.from("cleaner_earnings")');
    expect(src).not.toContain('.in("status", ["approved", "processing", "paid"])');
  });

  it("uses atomic retry-safe seed inventory reversal", () => {
    const sql = read("../../supabase/migrations/20261011080000_audit_02a04_financial_booking_delete_guard.sql");
    const seed = read("../../scripts/seed-dev.mjs");

    expect(sql).toContain("function public.reset_seed_inventory_movement");
    expect(sql).toContain("quantity_on_hand = quantity_on_hand - v_movement.quantity_delta");
    expect(sql).toContain("delete from public.inventory_movements where id = v_movement.id");
    expect(seed).toContain('admin.rpc("reset_seed_inventory_movement"');
    expect(seed).not.toContain('admin.rpc("record_inventory_movement"');
  });

  it("preflights referral reversibility before the first seed mutation", () => {
    const sql = read("../../supabase/migrations/20261011080000_audit_02a04_financial_booking_delete_guard.sql");
    const seed = read("../../scripts/seed-dev.mjs");

    expect(sql).toContain("function public.preflight_seed_financial_reset");
    expect(sql).toContain("referral_credit_already_spent");
    expect(sql).toContain("promotion_original_revenue_unproven");
    expect(sql).toContain("promotion_counter_reversal_unproven");
    expect(sql).toContain("is distinct from 'number'");
    expect(sql).toContain("counterIncrementCommitted");
    expect(sql).toContain("group by user_id");
    expect(seed).toContain('"preflight seed financial reset"');
    expect(seed).toContain('admin.rpc("preflight_seed_financial_reset"');
    expect(seed.indexOf('admin.rpc("preflight_seed_financial_reset"')).toBeLessThan(
      seed.indexOf('admin.from("admin_money_action_proposals").delete().in("id", Object.values(PROPOSAL_IDS))'),
    );
  });

  it("treats malformed promotion counter proof as unproven without boolean casts", () => {
    const sql = read("../../supabase/migrations/20261011080000_audit_02a04_financial_booking_delete_guard.sql");

    expect(sql).toContain("(v_redemption.metadata -> 'counterIncrementCommitted') is distinct from 'true'::jsonb");
    expect(sql).toContain("(pr.metadata -> 'counterIncrementCommitted') is distinct from 'true'::jsonb");
    expect(sql).not.toContain("counterIncrementCommitted')::boolean");
  });

  it("defers admin monthly completed state until canonical lines and earnings have persisted", () => {
    const src = read("app/api/admin/bookings/route.ts");
    const pipeline = read("lib/admin/adminBookingPostCreatePipeline.ts");
    const completedInsert = src.indexOf('source: "admin_monthly"');
    const precompletionEarnings = src.indexOf('"admin_booking_create_monthly_precompletion"');
    const completionPromotionCall = src.indexOf("promoteAdminMonthlyBookingToCompleted({");
    const completionPromotionFailure = src.indexOf('code: "admin_monthly_completion_promotion_failed"');
    const completedEarnings = src.indexOf('"admin_booking_create_monthly_completed"');

    expect(src).toContain("Completed monthly bookings are inserted as assigned first");
    expect(src).toContain('let rowStatus: "assigned" | "pending" = adminMarkCompleted');
    expect(src).not.toContain('let rowStatus: "completed" | "assigned" | "pending"');
    expect(src).toContain("promoteAdminMonthlyBookingToCompleted");
    expect(precompletionEarnings).toBeGreaterThan(completedInsert);
    expect(completionPromotionCall).toBeGreaterThan(precompletionEarnings);
    expect(completionPromotionFailure).toBeGreaterThan(completionPromotionCall);
    expect(completedEarnings).toBeGreaterThan(completionPromotionCall);
    expect(src).toContain("Booking created with canonical line items but could not be marked completed");

    expect(pipeline).toContain("function promoteAdminMonthlyBookingToCompleted");
    expect(pipeline).toContain('.eq("status", "assigned")');
    expect(pipeline).toContain('status: "completed"');
    expect(pipeline).toContain("buildCompletionCoherencePatch");
  });

  it("stores and reverses the original promotion revenue instead of mutable booking total", () => {
    const sql = read("../../supabase/migrations/20261011080000_audit_02a04_financial_booking_delete_guard.sql");
    const promo = read("lib/promotions/server.ts");

    expect(promo).toContain("bookingRevenueZar: args.bookingRevenueZar");
    expect(promo).toContain("counterIncrementCommitted: true");
    expect(promo).toContain("Promotion counter proof persistence failed");
    expect(sql).toContain("v_original_revenue_zar");
    expect(sql).toContain("v_redemption.metadata -> 'bookingRevenueZar'");
    expect(sql).toContain("promotion_original_revenue_unproven");
    expect(sql).not.toContain("coalesce(revenue_generated_zar, 0) - greatest(coalesce(v_total_price, 0), 0)");
  });

  it("reverses seed referral rewards before removing their ledger rows", () => {
    const sql = read("../../supabase/migrations/20261011080000_audit_02a04_financial_booking_delete_guard.sql");
    const seed = read("../../scripts/seed-dev.mjs");

    expect(sql).toContain("function public.reset_seed_referral_credit_for_booking");
    expect(sql).toContain("referral_credit_already_spent");
    expect(sql).toContain("set status = 'pending'");
    expect(sql).toContain("delete from public.cleaning_credit_transactions");
    expect(seed).toContain('admin.rpc("reset_seed_referral_credit_for_booking"');
    expect(seed.indexOf('admin.rpc("reset_seed_referral_credit_for_booking"')).toBeLessThan(
      seed.indexOf('"cleaning_credit_transactions",'),
    );
  });

  it("reconciles seed promotion counters before deleting redemption rows", () => {
    const sql = read("../../supabase/migrations/20261011080000_audit_02a04_financial_booking_delete_guard.sql");
    const seed = read("../../scripts/seed-dev.mjs");

    expect(sql).toContain("function public.reset_seed_promotion_redemptions_for_booking");
    expect(sql).toContain("redemptions_count = greatest(0");
    expect(sql).toContain("budget_spent_zar = greatest(");
    expect(sql).toContain("revenue_generated_zar = greatest(");
    expect(seed).toContain('admin.rpc("reset_seed_promotion_redemptions_for_booking"');
    expect(seed.indexOf('admin.rpc("reset_seed_promotion_redemptions_for_booking"')).toBeLessThan(
      seed.indexOf('"promotion_redemptions",'),
    );
  });

  it("makes settled seed Cleaning Credit restoration retry-safe", () => {
    const sql = read("../../supabase/migrations/20261011080000_audit_02a04_financial_booking_delete_guard.sql");
    const seed = read("../../scripts/seed-dev.mjs");

    expect(sql).toContain("function public.reset_seed_cleaning_credit_for_booking");
    expect(sql).toContain("not like 'DEVSEED-%'");
    expect(sql).toContain("if v.status = 'released' then");
    expect(sql).toContain("set status = 'released'");
    expect(seed).toContain('admin.rpc("reset_seed_cleaning_credit_for_booking"');
  });

  it("passes governed recurring IDs into seed helpers", () => {
    const seed = read("../../scripts/seed-dev.mjs");
    const sql = read("../../supabase/migrations/20261011080000_audit_02a04_financial_booking_delete_guard.sql");

    expect(seed).toContain("p_seed_recurring_ids: Object.values(RECURRING_IDS)");
    expect(sql).toContain("p_seed_recurring_ids uuid[]");
    expect(sql).toContain("v_recurring_id = any(coalesce(p_seed_recurring_ids, '{}'::uuid[]))");
  });

  it("includes generated seed recurring occurrences in reset scope", () => {
    const seed = read("../../scripts/seed-dev.mjs");

    expect(seed).toContain("load generated seed recurring occurrences");
    expect(seed).toContain('.in("recurring_id", Object.values(RECURRING_IDS))');
    expect(seed).toContain("new Set(");
  });

  it("clears both generic and direct booking ledger links during seed reset", () => {
    const seed = read("../../scripts/seed-dev.mjs");

    expect(seed).toContain("payment_transactions seed booking_id children");
    expect(seed).toContain("payment_transactions seed entity children");
    expect(seed).toContain("accounting_invoice_sync seed booking_id children");
    expect(seed).toContain("accounting_invoice_sync seed entity children");
    expect(seed).toContain('.eq("entity_type", "booking")');
    expect(seed).toContain('.in("entity_id", seedBookingIds)');
  });

  it("keeps the governed non-production seed reset compatible without weakening production guards", () => {
    const seed = read("../../scripts/seed-dev.mjs");

    expect(seed).toContain("assertNonProductionSeed");
    expect(seed).toContain("neutralize seed booking financial mirrors");
    expect(seed).toContain("booking_changes");
    expect(seed).toContain("booking_line_items");
    expect(seed).toContain("growth_action_outcomes");
    expect(seed).toContain("conversion_experiment_results");
    expect(seed).toContain("email_campaign_attributions");
    expect(seed).toContain("deposit_paid_cents: 0");
    expect(seed).toContain("cleaner_earnings_total_cents: 0");
    expect(seed).toContain("internal_earnings_cents: 0");
    expect(seed).toContain("preflight payout_audit_events");
    expect(seed).toContain("mix seed and non-seed bookings");
    expect(seed).toContain("reset_seed_inventory_movement");
    expect(seed).not.toContain('admin.rpc("record_inventory_movement"');
    expect(seed).toContain("reset_seed_cleaning_credit_for_booking");
    expect(seed).not.toContain('admin.rpc("apply_cleaning_credit_transaction"');
    expect(seed).toContain("recurring_prepaid_allocations");
    expect(seed).toContain("recurring_prepaid_packages");
    expect(seed).toContain('admin.from("bookings").delete().in("id", seedBookingIds)');
    expect(seed).toContain("Reset failed at");
  });

  it("keeps unpaid financially-unlinked cleanup rows outside the block predicate", () => {
    const sql = read("../../supabase/migrations/20261011080000_audit_02a04_financial_booking_delete_guard.sql");

    expect(sql).not.toContain("old.status = 'payment_expired'");
    expect(sql).not.toContain("old.is_test");
  });
});
