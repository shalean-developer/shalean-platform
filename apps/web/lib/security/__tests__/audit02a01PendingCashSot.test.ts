import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { bookingUncollectedCashColumns } from "@/lib/booking/bookingPaidAmountColumns";
import { trustedBookingPayableZar } from "@/lib/booking/ensureBookingPaymentSession";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("AUDIT-02A01 pending-payment cash source of truth", () => {
  it("keeps unpaid collected-cash columns explicitly zero", () => {
    expect(bookingUncollectedCashColumns()).toEqual({
      amount_paid_cents: 0,
      total_paid_cents: 0,
      total_paid_zar: 0,
    });

    const writer = read("lib/booking/insertPendingPaymentBooking.ts");
    expect(writer).toContain("...bookingUncollectedCashColumns()");
    expect(writer).not.toContain("total_paid_zar: params.totalPaidZar");
    expect(writer).not.toContain("totalPaidZar: number");
    expect(writer).toContain('admin.rpc("apply_pending_booking_init_patch"');
    expect(writer).toContain("Pending checkout changed or settlement evidence exists.");
    expect(writer).not.toContain('.from("bookings")\n    .update({');

  });

  it("persists the actual Paystack charge as payable without writing collected cash", () => {
    const initialize = read("lib/booking/paystackInitializeCore.ts");
    const updateCall = initialize.slice(
      initialize.indexOf("updatePendingPaymentBookingForInit(admin"),
      initialize.indexOf("if (!upd.ok)", initialize.indexOf("updatePendingPaymentBookingForInit(admin")),
    );

    expect(updateCall).toContain("totalPriceZar: totalZar");
    expect(updateCall).not.toContain("totalPaidZar:");
    expect(initialize).toContain("total_price: totalZar");
  });

  it("resolves payment-link payable from total_price before legacy cash fallback", () => {
    expect(
      trustedBookingPayableZar({
        total_price: 480,
        total_paid_zar: 0,
      }),
    ).toBe(480);

    expect(
      trustedBookingPayableZar({
        total_price: null,
        total_paid_zar: 480,
      }),
    ).toBe(480);

    const resend = read("app/api/admin/bookings/[id]/resend-payment-link/route.ts");
    expect(resend).toContain("trustedBookingPayableZar({");
    expect(resend).toContain("total_price: r.total_price");

    const initialAdmin = read("lib/admin/adminPaystackPostInitialize.ts");
    expect(initialAdmin).toContain("trustedBookingPayableZar({");
    expect(initialAdmin).toContain("total_price: row.total_price");

    const recoveryEmail = read("lib/email/paymentRecoveryEmails.ts");
    expect(recoveryEmail).toContain("trustedBookingPayableZar({");
    expect(recoveryEmail.indexOf("total_price:")).toBeGreaterThan(-1);
    expect(recoveryEmail.indexOf("total_paid_zar:")).toBeGreaterThan(
      recoveryEmail.indexOf("total_price:"),
    );

    const reminderCron = read("app/api/cron/payment-link-reminders/route.ts");
    expect(reminderCron).toContain("trustedBookingPayableZar({");
    expect(reminderCron).toContain("total_price: row.total_price");

    const recurringFallback = read("lib/recurring/recurringPaymentLinkFallback.ts");
    expect(recurringFallback).toContain("trustedBookingPayableZar({");
    expect(recurringFallback).toContain("total_price: head.total_price");
  });

  it("reconciles persisted checkout line items to the exact Paystack payable", () => {
    const initialize = read("lib/booking/paystackInitializeCore.ts");
    expect(initialize).toContain("const payableCents = zarToCents(totalZar)");
    expect(initialize).toContain("const payableDeltaCents = payableCents - sumLineItemsCents(visitLineItems)");
    expect(initialize).toContain('name: "Tip, discounts & payment adjustment"');
    expect(initialize).toContain("earns_cleaner: false");
    expect(initialize).toContain("if (lineSumCents !== payableCents)");
  });

  it("fails closed for complete pricing but rebuilds partial existing line items", () => {
    const initialize = read("lib/booking/paystackInitializeCore.ts");
    expect(initialize).toContain("if (hasLi && hasSnap)");
    expect(initialize).toContain("pricingComplete: true");
    expect(initialize).toContain("existingPayableZar");
    expect(initialize).toContain("existing pending payable differs from reinitialized charge");
    expect(initialize).toContain('errorCode: "PRICE_MISMATCH"');
    expect(initialize).toContain("Partial pricing state is not immutable yet");
    expect(initialize).toContain("return { bookingId: bid, skipLineItemInsert: false, pricingComplete: false }");
    expect(initialize).toContain("checkoutLineItems: pricingTarget.skipLineItemInsert ? null : checkoutLineItems");

    const writer = read("lib/booking/insertPendingPaymentBooking.ts");
    expect(writer).toContain('admin.rpc("apply_pending_booking_init_patch"');
    expect(writer).toContain("p_booking_id: params.bookingId");
    expect(writer).toContain("p_patch: patch");
    expect(writer).toContain("p_line_items: lineItemRows");
    expect(writer).not.toContain('"replace_booking_line_items_atomic"');
    expect(writer).not.toContain("persistBookingLineItems(admin, params.bookingId, lineItems)");
  });

  it("preserves the stored recurring package payable during fallback only", () => {
    const initialize = read("lib/booking/paystackInitializeCore.ts");
    expect(initialize).toContain("preserveExistingPendingPayable?: boolean");
    expect(initialize).toContain("preservedExistingPayableZar");
    expect(initialize).toContain("preservedExistingPriceSnapshot");
    expect(initialize).toContain("const totalZar = preservedExistingPayableZar ?? recomputedTotalZar");
    expect(initialize).toContain('payment_scope: "recurring_first_30_days" as const');
    expect(initialize).toContain("per_visit_price_zar");
    expect(initialize).toContain("prepaid_visit_count");

    const recurringFallback = read("lib/recurring/recurringPaymentLinkFallback.ts");
    expect(recurringFallback).toContain("{ preserveExistingPendingPayable: true }");

    const recurringPropagation = read("lib/recurring/propagateRecurringPlanToGeneratedBookings.ts");
    const recurringAtomicSql = read(
      "../../supabase/migrations/20261007061000_audit_02a01_recurring_reprice_atomic.sql",
    ).toLowerCase();

    expect(recurringPropagation).toContain("preserveRecurringPackagePayable");
    expect(recurringPropagation).toContain("const bookingSnapshotForMutableUpdate =");
    expect(recurringPropagation).toContain('...snapshot');
    expect(recurringPropagation).toContain("preservedPackageSnapshot.total_zar");
    expect(recurringPropagation).toContain('"recurringPrepayment" in preservedPackageSnapshot');
    expect(recurringPropagation).toContain('payment_scope === "recurring_first_30_days"');
    expect(recurringPropagation).toContain("mutableUnpaidCandidate");
    expect(recurringPropagation).toContain('admin.rpc(\n        "apply_recurring_occurrence_unpaid_patch"');
    expect(recurringPropagation).toContain("p_booking_id: booking.id");
    expect(recurringPropagation).toContain("p_patch: mutablePricingPatch");
    expect(recurringPropagation).toContain("bookingUncollectedCashColumns()");
    expect(recurringPropagation).toContain("const nonPricingPatch");
    expect(recurringPropagation).toContain("let bookingUpdate: Record<string, unknown> = nonPricingPatch");
    expect(recurringPropagation).not.toContain("booking_snapshot: booking.booking_snapshot ?? snapshot");
    expect(recurringPropagation).not.toContain("total_paid_zar: priceZar");

    expect(recurringAtomicSql).toContain(
      "create or replace function public.apply_recurring_occurrence_unpaid_patch",
    );
    expect(recurringAtomicSql).toContain("v_row public.bookings%rowtype");
    expect(recurringAtomicSql).toContain("select *");
    expect(recurringAtomicSql).toContain("into v_row");
    expect(recurringAtomicSql).toContain("for update");
    expect(recurringAtomicSql).toContain(
      "if exists (\n    select 1\n    from public.payment_transactions pt\n    where pt.booking_id = p_booking_id",
    );
    expect(recurringAtomicSql).toContain("lower(trim(coalesce(b.status, ''))) = 'pending_payment'");
    expect(recurringAtomicSql).toContain(
      "not in ('success', 'paid', 'succeeded', 'completed', 'pending_monthly')",
    );
    expect(recurringAtomicSql).toContain("b.payment_completed_at is null");
    expect(recurringAtomicSql).toContain("b.paid_at is null");
    expect(recurringAtomicSql).toContain("b.payment_transaction_id is null");
    expect(recurringAtomicSql).toContain("b.marked_paid_by_admin_id is null");
    expect(recurringAtomicSql).toContain("not exists");
    expect(recurringAtomicSql).toContain("from public.payment_transactions pt");
    expect(recurringAtomicSql).toContain(
      "grant execute on function public.apply_recurring_occurrence_unpaid_patch(uuid, jsonb) to service_role",
    );
    expect(recurringAtomicSql).toContain(
      "revoke all on function public.apply_recurring_occurrence_unpaid_patch(uuid, jsonb) from authenticated",
    );
    expect(recurringPropagation).toContain(
      'operationalStatus: "pending_payment"',
    );
    expect(recurringPropagation).toContain(
      "preferredCleanerId && !hasCustomExistingRoster && !assignmentCommitted",
    );
    expect(recurringPropagation).toContain("!mutableUnpaidCandidate");
    expect(recurringPropagation).toContain("!settlementMarkerPresent");
    expect(recurringPropagation).toContain(
      "...(preferredCleanerId",
    );
    expect(recurringPropagation).toContain("let cleanerMutationSucceeded = false");
    expect(recurringPropagation).toContain(
      "cleanerMutationSucceeded = Boolean(preferredCleanerId)",
    );
    expect(recurringPropagation).toContain(
      "preferredCleanerId && cleanerMutationSucceeded",
    );
    expect(recurringPropagation).toContain(
      "!bookingCompleted && !mutableUnpaidCandidate",
    );

    const paystackFinalize = read("lib/booking/upsertBookingFromPaystack.ts");
    expect(paystackFinalize).toContain('error.code === "PAYMENT_FINALIZATION_CONFLICT"');
    expect(paystackFinalize).toContain('reason: "finalization_failed" as const');
    expect(paystackFinalize).toContain("recoveryEnqueue: true");
    const settlementRecorder = read("lib/payments/recordGatewayPayment.ts");
    expect(settlementRecorder).toContain("completeSideEffects");
    expect(settlementRecorder).toContain("ensureExpenseAccountingQueue");
    expect(settlementRecorder).toContain('"entity_type", "expense"');
    expect(settlementRecorder).toContain("expense_accounting_queue_enrollment_failed");
    expect(settlementRecorder).toContain("payment_transaction_reconciled");
    expect(settlementRecorder).toContain('"expenses"');
    expect(settlementRecorder).toContain('"accounting_sync_records"');
    expect(settlementRecorder).toContain("payment_transaction_id: paymentTransactionId");
    expect(paystackFinalize).toContain('input.paystackPersistSource === "retry"');
    expect(paystackFinalize).toContain("normalizeUuidCandidate(existingPersistedSelectedCleanerId)");
    expect(paystackFinalize).toContain("applyRecurringOccurrenceRosterContinuity");
    const rosterContinuity = read("lib/recurring/applyRecurringOccurrenceRosterContinuity.ts");
    expect(rosterContinuity).toContain("booking_cleaners(cleaner_id, role, source)");
    expect(rosterContinuity).toContain("rosterHasCustomProvenance");
    expect(rosterContinuity).toContain("recurringOccurrenceAssignmentIsCommitted");
    expect(rosterContinuity).toContain("customExistingRoster");
    expect(rosterContinuity).toContain("committedAssignment");
    expect(rosterContinuity).toContain("authoritative_recurring_roster_missing_unique_lead");
    expect(rosterContinuity).toContain("cleaner_id: existingLeadId");
    expect(rosterContinuity).toContain("payout_owner_cleaner_id: existingLeadId");
    expect(rosterContinuity).toContain('source: "recurring_continuity"');
    expect(rosterContinuity).toContain("const existingRequestedLead = rosterRows.find");
    expect(rosterContinuity).toContain("const originalLead = rosterRows.find");
    expect(rosterContinuity).toContain("rosterRows = rosterRows.map");

    const adminRosterRoute = read("app/api/admin/bookings/[id]/roster/route.ts");
    expect(adminRosterRoute).toContain(
      'const rpcRows = built.rows.map((row) => ({ ...row, source: "admin_roster_edit" }))',
    );
    expect(adminRosterRoute).toContain("committedLead");

    const preferredRosterSync = read("lib/booking/persistPreferredCleaners.ts");
    expect(preferredRosterSync).toContain('"skipped_custom_existing_roster"');
    expect(preferredRosterSync).toContain("rosterHasCustomProvenance");
    expect(preferredRosterSync).toContain("syncPreferredCleanerOfferRoster");
    expect(preferredRosterSync).toContain('"deferred_preference_only"');
    expect(preferredRosterSync).not.toContain("replace_booking_cleaners_preference_atomic");
    expect(preferredRosterSync).not.toContain("rosterIsPreferenceOnly");
    const rosterProvenance = read("lib/recurring/recurringRosterProvenance.ts");
    expect(rosterProvenance).toContain('"checkout_preferred"');
    expect(rosterProvenance).toContain('"customer_preferred"');
    expect(rosterProvenance).toContain('"recurring_preferred"');
    expect(rosterProvenance).toContain('"recurring_continuity"');
    expect(rosterProvenance).toContain('"booking_v2_r0"');

    const cleanersRoute = read("app/api/admin/bookings/[id]/cleaners/route.ts");
    expect(cleanersRoute).toContain('{ defaultSource: "admin_roster_edit" }');
    expect(cleanersRoute).toContain('source: "admin_roster_edit"');
    expect(cleanersRoute).toContain("committedLead");
    expect(cleanersRoute).toContain("A01_ROSTER_LEAD_DIRECT_ASSIGN");

    const rosterRoute = read("app/api/admin/bookings/[id]/roster/route.ts");
    expect(rosterRoute).toContain('source: "admin_roster_edit"');
    expect(rosterRoute).toContain("committedLead");
    expect(rosterRoute).toContain("A01_ROSTER_LEAD_DIRECT_ASSIGN");

    const recurringInsert = read("lib/recurring/insertRecurringOccurrenceBooking.ts");
    expect(recurringInsert).toContain("if (prepaidAllocation && preferredCleanerIds.length >= 2)");
    expect(recurringInsert).toContain("else if (prepaidAllocation && preferredCleanerId)");
    expect(recurringInsert).toContain('syncPreferredCleanerRoster(admin, id, preferredCleanerIds, "recurring_preferred")');
    const unpaidPostInsert = recurringInsert.slice(recurringInsert.indexOf("if (prepaidAllocation && preferredCleanerIds.length >= 2)"));
    expect(unpaidPostInsert).not.toContain("syncPreferredCleanerOfferRoster");

    expect(rosterContinuity).toContain("leadCleanerId?: string");
    expect(rosterContinuity).toContain("leadCleanerId: existingLeadId");
    expect(rosterContinuity).toContain("leadCleanerId: leadId");

    expect(recurringPropagation).toContain("let reconciledCleanerId: string | null");
    expect(recurringPropagation).toContain("const rosterContinuity = await applyRecurringOccurrenceRosterContinuity");
    expect(recurringPropagation).toContain("if (rosterContinuity.leadCleanerId)");
    expect(recurringPropagation).toContain("reconciledCleanerId = rosterContinuity.leadCleanerId");
    expect(recurringPropagation).toContain("reconciledCleanerId ??");
    expect(recurringPropagation).toContain("recurring roster reconciliation failed");
    expect(recurringPropagation).toContain("booking_cleaners(cleaner_id, role, source)");
    expect(recurringPropagation).toContain("hasCustomExistingRoster");
    expect(recurringPropagation).toContain("assignmentCommitted");
    expect(recurringPropagation).toContain("customRosterLeadId");
    expect(recurringPropagation).toContain("preferredCleanerId && !hasCustomExistingRoster && !assignmentCommitted");
    expect(recurringPropagation).toContain("recurring custom roster reconciliation failed");
    expect(rosterContinuity.indexOf("customExistingRoster")).toBeLessThan(
      rosterContinuity.indexOf("let continuity = params.roster ?? null"),
    );
    expect(rosterContinuity).toContain("existingRoleByCleanerId");
    expect(rosterContinuity).toContain("desiredRoleByCleanerId");
    expect(rosterContinuity).toContain('desiredRoleByCleanerId.get(leadId) === "lead"');
    expect(paystackFinalize).toContain("recurringRosterGenerated && recurringRosterId && recurringRosterCleanerId");
    expect(rosterContinuity).toContain("requestedLeadId");
    const rosterFetch = read("lib/recurring/fetchLastAssignedRosterForRecurringPlan.ts");
    expect(rosterFetch).toContain("recurring_roster_lookup_failed");
    expect(rosterContinuity).toContain("catch (error)");
    expect(rosterContinuity).toContain("const shouldReplaceRoster = !rosterAlreadyMatches");
    expect(rosterContinuity).not.toContain("leadId === continuity.leadCleanerId");
    expect(rosterContinuity).toContain("const bookingPatch");
    expect(rosterContinuity).toContain("...(shouldReplaceRoster");
    expect(rosterContinuity).toContain('cleaner_response_status: "pending"');
    expect(rosterContinuity).toContain('dispatch_status: "assigned"');
    expect(rosterContinuity).toContain('status: "assigned"');
    expect(rosterContinuity).toContain(".update(bookingPatch)");
    expect(rosterContinuity).toContain('.from("bookings")');
    expect(rosterContinuity).toContain("cleaner_id: leadId");
    expect(rosterContinuity).toContain("requestedLeadId !== continuity.leadCleanerId");
    expect(rosterContinuity).toContain('role: member.cleaner_id === requestedLeadId ? "lead" : "member"');
    expect(rosterContinuity).toContain("cleaner_id: requestedLeadId");
    expect(rosterContinuity).toContain("ok: boolean");
    expect(paystackFinalize).toContain('"recurring_roster_reconciliation"');
    expect(paystackFinalize).toContain("if (!rosterContinuity.ok)");
    expect(paystackFinalize).toContain("const rosterRecoveryQueued = await enqueueFailedJob");
    expect(paystackFinalize).toContain("if (!rosterRecoveryQueued)");
    expect(paystackFinalize).toContain("recurring_roster_reconciliation_enqueue_failed");
    expect(paystackFinalize).toMatch(
      /st === "payment_reconciliation_required"[\s\S]*recoveryEnqueue: true/,
    );
    expect(paystackFinalize).toContain(
      'st === "payment_reconciliation_required" && input.paystackPersistSource !== "retry"',
    );
    expect(paystackFinalize).toContain(
      'st === "payment_reconciliation_required" && input.paystackPersistSource === "retry"',
    );
    expect(paystackFinalize).toContain("const runRequiredPostPersistRecovery = async");
    expect(paystackFinalize.indexOf("await runRequiredPostPersistRecovery()")).toBeLessThan(
      paystackFinalize.indexOf("if (input.deferPostPersistSideEffects)"),
    );

    const finalizeCommands = read("lib/booking/paymentFinalizationBookingCommands.ts");
    expect(finalizeCommands).toContain(
      '"payment_reconciliation_required"',
    );

    const bookingRecovery = read("lib/booking/enqueuePaystackRecoveryFailedJobs.ts");
    expect(bookingRecovery).toContain("recovery_payment_reconciliation_enqueue_failed");
    expect(bookingRecovery).toContain('throw new Error("recovery_payment_reconciliation_enqueue_failed")');

    const verifyPipeline = read("lib/booking/runPaystackVerifyFinalizePipeline.ts");
    expect(verifyPipeline.indexOf("await recordPaystackBookingPayment")).toBeLessThan(
      verifyPipeline.indexOf("after(runPostFinalizeWork)"),
    );
    expect(verifyPipeline.indexOf("await enqueuePaystackRecoveryFailedJobs")).toBeLessThan(
      verifyPipeline.indexOf("after(runPostFinalizeWork)"),
    );
    expect(paystackFinalize).toContain("is_recurring_generated, recurring_id, price_snapshot");
    expect(paystackFinalize).toContain("recurringRosterHeadErr");
    expect(paystackFinalize).toContain("recurring_roster_head_load_failed:");
    expect(paystackFinalize).toContain("existingIsRecurringGenerated");
    expect(paystackFinalize).toContain("fallbackRecurringId && fallbackLeadCleanerId");

    const settlementWrappers = read("lib/payments/recordPaystackSettlement.ts");
    expect(settlementWrappers).toContain("recordPaystackEntitySettlementWithRecovery");
    expect(settlementWrappers).toContain('"gateway_settlement_reconciliation"');
    expect(settlementWrappers).toContain("const recoveryQueued = await enqueueFailedJob");
    expect(settlementWrappers).toContain("if (!recoveryQueued)");
    expect(settlementWrappers).toContain("gateway_settlement_reconciliation_enqueue_failed");
    expect(settlementWrappers).toContain('entityType: "monthly_invoice"');
    expect(settlementWrappers).toContain('entityType: "sales_document"');

    const retryWorker = read("app/api/cron/retry-failed-jobs/route.ts");
    expect(retryWorker).toContain("FAILED_JOB_TYPE_GATEWAY_SETTLEMENT_RECONCILIATION");
    expect(retryWorker).toContain("gateway settlement reconciliation attempts exhausted");

    const recurringCleanerAtomicSql = read(
      "../../supabase/migrations/20261007073500_audit_02a01_recurring_cleaner_atomic.sql",
    ).toLowerCase();
    expect(recurringCleanerAtomicSql).toContain("selected_cleaner_id");
    expect(recurringCleanerAtomicSql).toContain("assignment_type");
    expect(recurringCleanerAtomicSql).toContain("cleaner_id");
    expect(recurringCleanerAtomicSql).toContain("for update");
    expect(recurringCleanerAtomicSql).toContain(
      "create or replace function public.apply_recurring_occurrence_unpaid_patch",
    );

    const rosterHeaderSql = read(
      "../../supabase/migrations/20261007210000_audit_02a01_roster_header_convergence.sql",
    ).toLowerCase();
    expect(rosterHeaderSql).toContain(
      "create or replace function public.replace_booking_cleaners_admin_atomic",
    );
    expect(rosterHeaderSql).toContain("cleaner_id = lead_id");
    expect(rosterHeaderSql).toContain("payout_owner_cleaner_id = lead_id");
    expect(rosterHeaderSql).toContain("cleaner_count = n_total");
    expect(rosterHeaderSql).not.toContain(
      "create or replace function public.replace_booking_cleaners_preference_atomic",
    );
    expect(rosterHeaderSql).toContain("lead_source = 'admin_roster_edit'");
    expect(rosterHeaderSql).toContain("a01_roster_lead_direct_assign");
    expect(rosterHeaderSql).toContain("lead replacement requires canonical direct assignment");
    expect(rosterHeaderSql).toContain("v_old_cleaner_id is distinct from lead_id");
    expect(rosterHeaderSql).toContain("v_team_id is null");
    expect(rosterHeaderSql).toContain("not coalesce(v_is_team_job, false)");
    expect(rosterHeaderSql).toContain("team_member_count_snapshot = case");
    expect(rosterHeaderSql).toContain("then n_total");
    expect(rosterHeaderSql).not.toContain("committed lead replacement requires canonical direct assignment");
    expect(rosterHeaderSql).not.toContain("update public.dispatch_offers");
    expect(rosterHeaderSql).not.toContain("assignment_type = 'admin_assigned'");

    const payoutRemoval = read("lib/payout/removeCleanerFromVisitPayout.ts");
    expect(payoutRemoval).toContain('source: "admin_remove_visit_payout"');
    expect(payoutRemoval).not.toContain('source: m.source ?? "admin_remove_visit_payout"');
    expect(rosterHeaderSql).toContain("set cleaner_count = n_total");
    expect(rosterHeaderSql).not.toContain("set cleaner_id = lead_id,\n         payout_owner_cleaner_id = lead_id,\n         cleaner_count = n_total\n   where b.id = p_booking_id;\n\n  return 'synced'");
    expect(rosterHeaderSql).not.toContain("replace_booking_cleaners_preference_atomic");
    expect(rosterHeaderSql).not.toContain("selected_cleaner_id = lead_id");

    const recurringRestore = read("lib/recurring/restoreRecurringPreferredCleanerAssignments.ts");
    expect(recurringRestore).toContain("rosterResult = await applyRecurringOccurrenceRosterContinuity");
    expect(recurringRestore).toContain("if (!rosterResult.ok)");
    expect(recurringRestore).toContain('rosterResult.kind === "committed_existing"');
    expect(recurringRestore).toContain('rosterResult.kind === "locked"');
    expect(recurringRestore).toContain("rosterLifecyclePromoted");
    expect(recurringRestore).toContain("rosterAssignmentCommitted");
    expect(recurringRestore).toContain("!rosterLifecyclePromoted");
    expect(recurringRestore).toContain("!rosterAssignmentCommitted");
    expect(recurringRestore).toContain('rosterKind !== "committed_existing"');
    expect(recurringRestore).toContain('rosterKind !== "locked"');
    const lifecycleRepairStart = recurringRestore.indexOf(
      'if (\n      rosterKind !== "committed_existing"',
    );
    const lifecycleRepairEnd = recurringRestore.indexOf(
      "const patch = recurringOccurrenceCleanerPatch",
      lifecycleRepairStart,
    );
    expect(lifecycleRepairStart).toBeGreaterThan(-1);
    expect(lifecycleRepairEnd).toBeGreaterThan(lifecycleRepairStart);
    expect(
      recurringRestore.slice(lifecycleRepairStart, lifecycleRepairEnd),
    ).not.toContain('rosterKind !== "custom_existing"');
    expect(recurringRestore).toContain("let repaired = false");
    expect(recurringRestore).toContain("if (repaired) updated++");
    expect(rosterContinuity).toContain("lifecyclePromoted?: boolean");
    expect(rosterContinuity).toContain("assignmentCommitted?: boolean");
    expect(rosterContinuity).toContain("assignmentCommitted: committedAssignment");
    expect(rosterContinuity).toContain(
      "committed_recurring_identity_requires_manual_reconciliation",
    );
    const committedBranchStart = rosterContinuity.indexOf("if (committedAssignment)");
    const continuityLookupStart = rosterContinuity.indexOf("let continuity = params.roster ?? null");
    const committedBranch = rosterContinuity.slice(committedBranchStart, continuityLookupStart);
    expect(committedBranch).not.toContain("params.leadCleanerId");
    expect(committedBranch).not.toContain(".update(");
    expect(rosterContinuity).toContain("lifecyclePromoted: shouldReplaceRoster");
    expect(rosterContinuity).toContain('kind: "locked"');


  });

  it("repairs only evidence-free anomalies and adds a validated DB guard", () => {
    const predeploySql = read(
      "../../supabase/migrations/20261007023000_audit_02a01_pending_cash_sot.sql",
    ).toLowerCase();
    const postdeploySql = read(
      "../../supabase/migrations/20261007024500_audit_02a01_postdeploy_cash_guard.sql",
    ).toLowerCase();
    const sql = `${predeploySql}\n${postdeploySql}`;

    expect(sql).toContain("payment_completed_at is null");
    expect(sql).toContain("paid_at is null");
    expect(sql).toContain("payment_transaction_id is null");
    expect(sql).toContain("marked_paid_by_admin_id is null");
    expect(sql).toContain("not exists");
    expect(sql).toContain("from public.payment_transactions");
    expect(sql).toContain("bookings_pending_unpaid_cash_zero");
    expect(sql).toContain("payment_status, 'pending'");
    expect(sql).toContain("not in ('success', 'paid', 'succeeded', 'completed', 'pending_monthly')");
    expect(sql).toContain("in ('success', 'paid', 'succeeded', 'completed', 'pending_monthly')");
    expect(sql).toContain("payment_completed_at is not null");
    expect(sql).toContain("paid_at is not null");
    expect(sql).toContain("payment_transaction_id is not null");
    expect(sql).toContain("marked_paid_by_admin_id is not null");
    expect(sql).toContain("audit_02a01_ledger_only_settlement_requires_manual_reconciliation");
    expect(sql).toContain("audit_02a01_divergent_cash_mirrors_require_manual_reconciliation");
    expect(sql).toContain("coalesce(b.total_paid_zar, 0) <= 0");
    expect(postdeploySql).toContain("do $audit02a01_repair_lock$");
    expect(postdeploySql).toContain("for update");
    expect(postdeploySql.indexOf("do $audit02a01_repair_lock$")).toBeLessThan(
      postdeploySql.indexOf("create temporary table audit_02a01_repair"),
    );
    expect(postdeploySql).toContain("do $audit02a01_ledger$");
    expect(postdeploySql).toContain("$audit02a01_ledger$;");
    expect(postdeploySql).toContain("do $audit02a01_cashshape$");
    expect(postdeploySql).toContain("do $audit02a01_payable$");
    expect(postdeploySql).toContain("do $audit02a01_lines$");
    expect(sql).toContain("audit_02a01_legacy_payable_corroboration_failed");
    expect(sql).toContain("create or replace function public.apply_pending_booking_init_patch");
    expect(predeploySql).toContain("p_line_items jsonb default null");
    expect(predeploySql).toContain("delete from public.booking_line_items where booking_id = p_booking_id");
    expect(predeploySql).toContain("from jsonb_array_elements(p_line_items) as r");
    expect(predeploySql).not.toContain("bookings_pending_unpaid_cash_zero");
    expect(postdeploySql).toContain("bookings_pending_unpaid_cash_zero");
    expect(postdeploySql).toContain("legacy checkout payable reconciliation");
    expect(postdeploySql).toContain("audit_02a01_line_item_reconciliation_failed");
    expect(sql).toContain("for update");
    expect(sql).toContain("from public.payment_transactions pt");
    expect(predeploySql).toContain("grant execute on function public.apply_pending_booking_init_patch(uuid, jsonb, jsonb) to service_role");
    expect(sql).not.toContain("    user_id,");
    expect(sql).not.toContain("      x.user_id,");
    expect(sql).toContain("booking_snapshot->'total_zar'");
    expect(sql).toContain("booking_snapshot->>'total_zar'");
    expect(sql).toContain("price_snapshot->'total_price'");
    expect(sql).toContain("price_snapshot->>'total_price'");
    expect(sql).toContain("sum(coalesce(bli.total_price_cents, 0))");
    expect(postdeploySql).toContain("require independent corroboration of the legacy payable");
    expect(sql).toContain(") is not true");
    expect(postdeploySql).toContain("total_price = r.legacy_payable_zar");
    expect(postdeploySql).toContain("'{pay_total_zar}'");
    expect(postdeploySql.indexOf("total_price = r.legacy_payable_zar")).toBeLessThan(
      postdeploySql.indexOf("amount_paid_cents = 0"),
    );
    expect(sql).toContain("validate constraint bookings_pending_unpaid_cash_zero");
  });
});
