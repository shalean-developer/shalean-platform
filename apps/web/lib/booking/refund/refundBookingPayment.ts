import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  assertRefundProviderTransition,
  paymentStatusForAggregate,
  resolveRefundAggregateStatus,
  type RefundProviderState,
} from "@/lib/booking/refund/refundStateMachine";
import { decideRefundAmount, maskPaymentReference, resolveCapturedCents } from "@/lib/booking/refund/refundRules";
import {
  findRefundRecord,
  initRefundWorkflow,
  mergeRefundWorkflowIntoSnapshot,
  priorSucceededRefundedCents,
  readRefundWorkflow,
  upsertRefundRecord,
  type BookingRefundRecord,
  type BookingRefundWorkflow,
} from "@/lib/booking/refund/refundSnapshot";
import {
  evaluateRefundMakerChecker,
  refundMakerCheckerEnabled,
} from "@/lib/booking/refund/refundMakerChecker";
import { assertRefundReconciliation } from "@/lib/booking/refund/refundReconciliation";
import { recordGatewayRefund } from "@/lib/booking/refund/recordGatewayRefund";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { logPaymentStructured } from "@/lib/observability/paymentStructuredLog";
import { refundPaystackTransaction } from "@/lib/paystack/refundPaystackTransaction";
import { maybeProcessReferralClawbackOnBookingChange } from "@/lib/referrals/clawback";

export type RefundBookingPaymentResult =
  | {
      ok: true;
      mode: "applied" | "proposed";
      proposalId?: string;
      paystackRefunded: boolean;
      recordedOnly: boolean;
      alreadyReversedOnPaystack: boolean;
      refundReference: string | null;
      refundStatus: "full" | "partial";
      refundId: string | null;
      providerState: RefundProviderState | "requested";
      clawbackTriggered: boolean;
      amountCents: number;
      refundableRemainingCents: number;
    }
  | { ok: false; error: string; code?: string };

export type RefundBookingParams = {
  bookingId: string;
  note?: string;
  cancellationReason?: string;
  /** Skip Paystack API — use when refund was done in the Paystack dashboard. */
  recordOnly?: boolean;
  /** Optional Paystack refund id/reference from the dashboard. */
  refundReference?: string;
  /** Partial refund amount in cents. Omit for full refund of remaining refundable. */
  amountCents?: number;
  /** Maker–checker: approving admin passes proposal id from prior request. */
  proposalId?: string | null;
  adminUserId?: string | null;
  adminEmail?: string | null;
  /** Retry a failed refund record by id. */
  retryRefundId?: string | null;
};

function newRefundId(): string {
  return `rfnd_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

function sanitizeProviderOutcome(message: string | null | undefined): string | null {
  if (!message) return null;
  return String(message)
    .replace(/sk_(live|test)_[A-Za-z0-9]+/gi, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .slice(0, 240);
}

async function persistWorkflow(
  admin: SupabaseClient,
  bookingId: string,
  snapshot: unknown,
  workflow: BookingRefundWorkflow,
  patch: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const nextSnapshot = mergeRefundWorkflowIntoSnapshot(snapshot, workflow);
  const { error } = await admin
    .from("bookings")
    .update({ ...patch, booking_snapshot: nextSnapshot })
    .eq("id", bookingId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Admin booking refund (Princess PR D).
 * - Cumulative partials via booking_snapshot.refund_workflow
 * - Claim → provider → succeed/fail with retry
 * - Separate immutable capture + refund ledger lines
 * - Optional maker–checker (REFUND_MAKER_CHECKER / PAYOUT_MAKER_CHECKER)
 */
export async function refundBookingPayment(
  admin: SupabaseClient,
  params: RefundBookingParams,
): Promise<RefundBookingPaymentResult> {
  const { data, error } = await admin
    .from("bookings")
    .select(
      "id, status, payment_status, paystack_reference, amount_paid_cents, total_paid_cents, total_paid_zar, refunded_at, refund_status, monthly_invoice_id, user_id, customer_email, booking_snapshot, currency",
    )
    .eq("id", params.bookingId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "booking_not_found" };

  const row = data as {
    id: string;
    status: string | null;
    payment_status: string | null;
    paystack_reference: string | null;
    amount_paid_cents: number | null;
    total_paid_cents: number | null;
    total_paid_zar: number | null;
    refunded_at: string | null;
    refund_status: string | null;
    monthly_invoice_id: string | null;
    user_id: string | null;
    customer_email: string | null;
    booking_snapshot: unknown;
    currency: string | null;
  };

  if (row.monthly_invoice_id) {
    return { ok: false, error: "monthly_child_use_invoice_refund" };
  }

  const existingRefund = String(row.refund_status ?? "").toLowerCase();
  if (["chargeback", "reversed"].includes(existingRefund)) {
    return { ok: false, error: "already_refunded" };
  }

  let workflow =
    readRefundWorkflow(row.booking_snapshot) ??
    initRefundWorkflow({
      capturedCents: resolveCapturedCents({
        ...row,
        original_captured_cents: null,
      }),
      currency: row.currency ?? "ZAR",
    });

  // If workflow was just initialized but prior partials mutated paid columns without workflow,
  // prefer remaining + refunded reconstruction from refund_status=partial.
  if (
    !readRefundWorkflow(row.booking_snapshot) &&
    existingRefund === "partial" &&
    row.refunded_at
  ) {
    // Legacy one-shot partial: remaining is in amount_paid; treat remaining as still refundable,
    // captured = remaining (cannot recover original without workflow). Further refunds allowed.
    workflow = initRefundWorkflow({
      capturedCents: resolveCapturedCents(row),
      currency: row.currency ?? "ZAR",
    });
  } else if (!readRefundWorkflow(row.booking_snapshot) && existingRefund === "full") {
    return { ok: false, error: "already_refunded" };
  } else if (
    !readRefundWorkflow(row.booking_snapshot) &&
    row.refunded_at &&
    ["refunded", "full"].includes(existingRefund)
  ) {
    return { ok: false, error: "already_refunded" };
  }

  const capturedCents = workflow.captured_cents > 0
    ? workflow.captured_cents
    : resolveCapturedCents(row);
  if (workflow.captured_cents <= 0 && capturedCents > 0) {
    workflow = { ...workflow, captured_cents: capturedCents };
  }

  const priorRefunded = priorSucceededRefundedCents(workflow);
  if (existingRefund === "full" && priorRefunded >= capturedCents && capturedCents > 0) {
    return { ok: false, error: "already_refunded" };
  }

  const retryId = typeof params.retryRefundId === "string" ? params.retryRefundId.trim() : "";
  if (retryId) {
    return retryFailedRefund(admin, row, workflow, params, retryId);
  }

  const amountDecision = decideRefundAmount({
    capturedCents,
    priorRefundedCents: priorRefunded,
    requestedCents: params.amountCents,
    currency: row.currency ?? workflow.currency,
  });
  if (!amountDecision.ok) {
    return { ok: false, error: amountDecision.error };
  }

  const adminUserId = params.adminUserId?.trim() || "";
  const mc = evaluateRefundMakerChecker({
    enabled: refundMakerCheckerEnabled() && Boolean(adminUserId),
    adminUserId,
    proposalId: params.proposalId,
    pendingProposal: workflow.pending_proposal,
    requestedAmountCents: params.amountCents ?? null,
  });
  if (!mc.ok) {
    return { ok: false, error: mc.error, code: mc.code };
  }

  if (mc.mode === "propose") {
    const proposalId = `rprop_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const now = new Date();
    const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    workflow = {
      ...workflow,
      pending_proposal: {
        id: proposalId,
        amount_cents: params.amountCents ?? null,
        reason: params.note?.slice(0, 500) ?? null,
        cancellation_reason: params.cancellationReason?.slice(0, 500) ?? null,
        record_only: params.recordOnly === true,
        refund_reference: params.refundReference?.trim() || null,
        proposed_by: adminUserId,
        proposed_by_email: params.adminEmail ?? null,
        proposed_at: now.toISOString(),
        expires_at: expires.toISOString(),
      },
    };
    const saved = await persistWorkflow(admin, row.id, row.booking_snapshot, workflow, {});
    if (!saved.ok) return { ok: false, error: saved.error };

    logPaymentStructured("payment_refund_proposed", {
      booking_id: row.id,
      proposal_id: proposalId,
      amount_cents: amountDecision.requestedCents,
      currency: workflow.currency,
      operator: params.adminEmail ?? adminUserId,
      reference_masked: maskPaymentReference(row.paystack_reference),
    });

    return {
      ok: true,
      mode: "proposed",
      proposalId,
      paystackRefunded: false,
      recordedOnly: false,
      alreadyReversedOnPaystack: false,
      refundReference: null,
      refundStatus: amountDecision.kind,
      refundId: null,
      providerState: "requested",
      clawbackTriggered: false,
      amountCents: amountDecision.requestedCents,
      refundableRemainingCents: amountDecision.refundableCents,
    };
  }

  // Clear proposal on approve/direct
  const approvedBy = mc.mode === "approve" ? adminUserId : null;
  const approvedByEmail = mc.mode === "approve" ? params.adminEmail ?? null : null;
  let finalDecision = amountDecision;
  if (mc.mode === "approve" && workflow.pending_proposal) {
    const prop = workflow.pending_proposal;
    if (params.amountCents == null && prop.amount_cents != null) {
      const again = decideRefundAmount({
        capturedCents,
        priorRefundedCents: priorRefunded,
        requestedCents: prop.amount_cents,
        currency: row.currency ?? workflow.currency,
      });
      if (!again.ok) return { ok: false, error: again.error };
      finalDecision = again;
    }
    if (!params.note && prop.reason) params.note = prop.reason;
    if (params.recordOnly !== true && prop.record_only) params.recordOnly = true;
    if (!params.refundReference && prop.refund_reference) {
      params.refundReference = prop.refund_reference;
    }
  }
  workflow = { ...workflow, pending_proposal: null };

  return submitAndFinalizeRefund(admin, row, workflow, params, finalDecision, {
    approvedBy,
    approvedByEmail,
    requestedBy: mc.mode === "approve" ? null : adminUserId || null,
    requestedByEmail: mc.mode === "approve" ? null : params.adminEmail ?? null,
  });
}

async function retryFailedRefund(
  admin: SupabaseClient,
  row: {
    id: string;
    status: string | null;
    payment_status: string | null;
    paystack_reference: string | null;
    booking_snapshot: unknown;
    currency: string | null;
  },
  workflow: BookingRefundWorkflow,
  params: RefundBookingParams,
  retryId: string,
): Promise<RefundBookingPaymentResult> {
  const existing = findRefundRecord(workflow, retryId);
  if (!existing) return { ok: false, error: "refund_not_found" };
  if (existing.provider_state !== "failed") {
    return { ok: false, error: "refund_not_retryable" };
  }
  const transition = assertRefundProviderTransition(existing.provider_state, "submitted_to_provider");
  if (!transition.ok) return { ok: false, error: transition.error };

  const amountDecision = decideRefundAmount({
    capturedCents: workflow.captured_cents,
    priorRefundedCents: priorSucceededRefundedCents(workflow),
    requestedCents: existing.amount_cents,
    currency: workflow.currency,
  });
  if (!amountDecision.ok) return { ok: false, error: amountDecision.error };

  const nowIso = new Date().toISOString();
  let record: BookingRefundRecord = {
    ...existing,
    provider_state: "submitted_to_provider",
    retry_count: existing.retry_count + 1,
    updated_at: nowIso,
    failed_at: null,
    provider_outcome: null,
  };
  workflow = upsertRefundRecord(workflow, record);
  const claimed = await persistWorkflow(admin, row.id, row.booking_snapshot, workflow, {});
  if (!claimed.ok) return { ok: false, error: claimed.error };

  return finalizeProviderSubmission(admin, row, workflow, record, params, amountDecision.kind);
}

async function submitAndFinalizeRefund(
  admin: SupabaseClient,
  row: {
    id: string;
    status: string | null;
    payment_status: string | null;
    paystack_reference: string | null;
    booking_snapshot: unknown;
    currency: string | null;
    user_id?: string | null;
    customer_email?: string | null;
  },
  workflow: BookingRefundWorkflow,
  params: RefundBookingParams,
  amountDecision: Extract<ReturnType<typeof decideRefundAmount>, { ok: true }>,
  actors: {
    approvedBy: string | null;
    approvedByEmail: string | null;
    requestedBy: string | null;
    requestedByEmail: string | null;
  },
): Promise<RefundBookingPaymentResult> {
  const nowIso = new Date().toISOString();
  const refundId = newRefundId();
  let record: BookingRefundRecord = {
    id: refundId,
    amount_cents: amountDecision.requestedCents,
    currency: workflow.currency,
    kind: amountDecision.kind,
    reason: params.note?.slice(0, 500) ?? null,
    cancellation_reason: params.cancellationReason?.slice(0, 500) ?? null,
    provider_state: "submitted_to_provider",
    provider_reference: params.refundReference?.trim() || null,
    provider_outcome: null,
    record_only: params.recordOnly === true,
    requested_by: actors.requestedBy,
    requested_by_email: actors.requestedByEmail,
    approved_by: actors.approvedBy,
    approved_by_email: actors.approvedByEmail,
    retry_count: 0,
    created_at: nowIso,
    updated_at: nowIso,
    succeeded_at: null,
    failed_at: null,
  };

  workflow = upsertRefundRecord(workflow, record);
  const claimed = await persistWorkflow(admin, row.id, row.booking_snapshot, workflow, {});
  if (!claimed.ok) return { ok: false, error: claimed.error };

  return finalizeProviderSubmission(admin, row, workflow, record, params, amountDecision.kind);
}

async function finalizeProviderSubmission(
  admin: SupabaseClient,
  row: {
    id: string;
    status: string | null;
    payment_status: string | null;
    paystack_reference: string | null;
    booking_snapshot: unknown;
    currency: string | null;
  },
  workflow: BookingRefundWorkflow,
  record: BookingRefundRecord,
  params: RefundBookingParams,
  kind: "full" | "partial",
): Promise<RefundBookingPaymentResult> {
  const chargeRef = row.paystack_reference?.trim() || null;
  const recordOnly = params.recordOnly === true || record.record_only;
  let paystackRefunded = false;
  let alreadyReversedOnPaystack = false;
  let refundReference = record.provider_reference || params.refundReference?.trim() || null;

  if (!recordOnly && chargeRef) {
    // Always pass explicit cents — omitting amount asks Paystack for the full original
    // charge, which breaks cumulative partials completing to "full".
    const refundResult = await refundPaystackTransaction({
      transactionReference: chargeRef,
      amountCents: record.amount_cents,
      merchantNote: params.note ?? record.reason ?? undefined,
    });
    if (!refundResult.ok) {
      const failedAt = new Date().toISOString();
      const failed: BookingRefundRecord = {
        ...record,
        provider_state: "failed",
        provider_outcome: sanitizeProviderOutcome(refundResult.error),
        updated_at: failedAt,
        failed_at: failedAt,
      };
      workflow = upsertRefundRecord(workflow, failed);
      await persistWorkflow(admin, row.id, row.booking_snapshot, workflow, {});
      logPaymentStructured("payment_refund_failed", {
        booking_id: row.id,
        refund_id: record.id,
        amount_cents: record.amount_cents,
        currency: record.currency,
        reference_masked: maskPaymentReference(chargeRef),
        provider_outcome: failed.provider_outcome,
        retry_count: failed.retry_count,
      });
      return { ok: false, error: refundResult.error };
    }
    paystackRefunded = true;
    alreadyReversedOnPaystack = refundResult.alreadyReversed === true;
    refundReference = refundResult.refundReference || refundReference || chargeRef;
  } else if (!chargeRef && !recordOnly) {
    const failedAt = new Date().toISOString();
    const failed: BookingRefundRecord = {
      ...record,
      provider_state: "failed",
      provider_outcome: "missing_paystack_reference",
      updated_at: failedAt,
      failed_at: failedAt,
    };
    workflow = upsertRefundRecord(workflow, failed);
    await persistWorkflow(admin, row.id, row.booking_snapshot, workflow, {});
    return { ok: false, error: "missing_paystack_reference" };
  }

  return markRefundSucceeded(admin, row, workflow, record, {
    paystackRefunded,
    recordedOnly: recordOnly,
    alreadyReversedOnPaystack,
    refundReference,
    kind,
  });
}

async function markRefundSucceeded(
  admin: SupabaseClient,
  row: {
    id: string;
    status: string | null;
    payment_status: string | null;
    paystack_reference: string | null;
    booking_snapshot: unknown;
    currency: string | null;
  },
  workflow: BookingRefundWorkflow,
  record: BookingRefundRecord,
  meta: {
    paystackRefunded: boolean;
    recordedOnly: boolean;
    alreadyReversedOnPaystack: boolean;
    refundReference: string | null;
    kind: "full" | "partial";
  },
): Promise<RefundBookingPaymentResult> {
  const nowIso = new Date().toISOString();
  if (
    record.provider_state !== "submitted_to_provider" &&
    record.provider_state !== "pending" &&
    record.provider_state !== "succeeded"
  ) {
    const transition = assertRefundProviderTransition(record.provider_state, "succeeded");
    if (!transition.ok) return { ok: false, error: transition.error };
  }
  // Idempotent: already succeeded
  if (record.provider_state === "succeeded") {
    return {
      ok: true,
      mode: "applied",
      paystackRefunded: meta.paystackRefunded,
      recordedOnly: meta.recordedOnly,
      alreadyReversedOnPaystack: meta.alreadyReversedOnPaystack,
      refundReference: meta.refundReference,
      refundStatus: meta.kind,
      refundId: record.id,
      providerState: "succeeded",
      clawbackTriggered: false,
      amountCents: record.amount_cents,
      refundableRemainingCents: Math.max(0, workflow.captured_cents - workflow.refunded_cents),
    };
  }

  const succeeded: BookingRefundRecord = {
    ...record,
    provider_state: "succeeded",
    provider_reference: meta.refundReference,
    provider_outcome: meta.alreadyReversedOnPaystack ? "already_reversed_on_provider" : "succeeded",
    updated_at: nowIso,
    succeeded_at: nowIso,
    failed_at: null,
  };
  workflow = upsertRefundRecord(workflow, succeeded);

  const aggregate = resolveRefundAggregateStatus({
    capturedCents: workflow.captured_cents,
    refundedCents: workflow.refunded_cents,
  });
  const remainingCents = Math.max(0, workflow.captured_cents - workflow.refunded_cents);

  const recon = assertRefundReconciliation({
    capturedCents: workflow.captured_cents,
    refundedCents: workflow.refunded_cents,
    currency: workflow.currency,
    ledgerLines: [
      {
        kind: "capture",
        amountCents: workflow.captured_cents,
        currency: workflow.currency,
        gatewayReference: row.paystack_reference?.trim() || `capture:${row.id}`,
      },
      ...workflow.records
        .filter((r) => r.provider_state === "succeeded")
        .map((r) => ({
          kind: "refund" as const,
          amountCents: r.amount_cents,
          currency: r.currency,
          gatewayReference: `refund:${row.paystack_reference ?? row.id}:${r.id}`,
        })),
    ],
  });
  if (!recon.ok) {
    return { ok: false, error: recon.error };
  }

  const patch: Record<string, unknown> = {
    refunded_at: nowIso,
    refund_status: aggregate === "full" ? "full" : "partial",
    payment_status: paymentStatusForAggregate(aggregate, row.payment_status),
  };
  // Keep original paid columns as capture audit when full; for partial store remaining net.
  if (aggregate === "partial") {
    patch.amount_paid_cents = remainingCents;
    patch.total_paid_cents = remainingCents;
    patch.total_paid_zar = Math.round(remainingCents) / 100;
  }

  const saved = await persistWorkflow(admin, row.id, row.booking_snapshot, workflow, patch);
  if (!saved.ok) return { ok: false, error: saved.error };

  if (row.paystack_reference?.trim()) {
    await recordGatewayRefund(admin, {
      chargeReference: row.paystack_reference.trim(),
      refundId: succeeded.id,
      entityType: "booking",
      entityId: row.id,
      amountCents: succeeded.amount_cents,
      currencyCode: succeeded.currency,
      bookingId: row.id,
      refundedAtIso: nowIso,
    });
  }

  await maybeProcessReferralClawbackOnBookingChange({
    admin,
    bookingId: row.id,
    newStatus: row.status,
    refundedAt: nowIso,
    refundStatus: String(patch.refund_status),
  });

  await logSystemEvent({
    level: "info",
    source: "booking/refund",
    message: "booking.refund.recorded",
    context: {
      bookingId: row.id,
      refundId: succeeded.id,
      refundStatus: meta.kind,
      aggregate,
      requestedCents: succeeded.amount_cents,
      refundedCents: workflow.refunded_cents,
      capturedCents: workflow.captured_cents,
      paystackRefunded: meta.paystackRefunded,
      recordedOnly: meta.recordedOnly,
      alreadyReversedOnPaystack: meta.alreadyReversedOnPaystack,
      refundReference: maskPaymentReference(meta.refundReference),
      note: succeeded.reason,
      approvedBy: succeeded.approved_by_email ?? succeeded.approved_by,
      requestedBy: succeeded.requested_by_email ?? succeeded.requested_by,
    },
  });

  logPaymentStructured("payment_refund_succeeded", {
    booking_id: row.id,
    refund_id: succeeded.id,
    amount_cents: succeeded.amount_cents,
    currency: succeeded.currency,
    aggregate,
    reference_masked: maskPaymentReference(row.paystack_reference),
    provider_state: "succeeded",
    retry_count: succeeded.retry_count,
  });

  return {
    ok: true,
    mode: "applied",
    paystackRefunded: meta.paystackRefunded,
    recordedOnly: meta.recordedOnly,
    alreadyReversedOnPaystack: meta.alreadyReversedOnPaystack,
    refundReference: meta.refundReference,
    refundStatus: aggregate === "full" ? "full" : "partial",
    refundId: succeeded.id,
    providerState: "succeeded",
    clawbackTriggered: true,
    amountCents: succeeded.amount_cents,
    refundableRemainingCents: remainingCents,
  };
}

/**
 * Apply provider webhook confirmation for an in-flight refund (pending / submitted).
 */
export async function applyBookingRefundProviderUpdate(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    paystackReference?: string | null;
    providerState: "pending" | "succeeded" | "failed";
    providerReference?: string | null;
    amountCents?: number | null;
    note?: string;
  },
): Promise<{ ok: true; updated: boolean } | { ok: false; error: string }> {
  const { data, error } = await admin
    .from("bookings")
    .select(
      "id, status, payment_status, paystack_reference, amount_paid_cents, total_paid_cents, total_paid_zar, refunded_at, refund_status, booking_snapshot, currency",
    )
    .eq("id", params.bookingId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "booking_not_found" };

  const row = data as {
    id: string;
    status: string | null;
    payment_status: string | null;
    paystack_reference: string | null;
    booking_snapshot: unknown;
    currency: string | null;
  };

  const workflow = readRefundWorkflow(row.booking_snapshot);
  if (!workflow) {
    // No local request — acknowledge without inventing a refund (ops may use record_only).
    return { ok: true, updated: false };
  }

  const open = [...workflow.records]
    .reverse()
    .find((r) => r.provider_state === "pending" || r.provider_state === "submitted_to_provider");

  if (!open) {
    // Duplicate success webhook after local succeed — idempotent no-op.
    if (params.providerState === "succeeded") return { ok: true, updated: false };
    return { ok: true, updated: false };
  }

  if (params.providerState === "pending") {
    const next: BookingRefundRecord = {
      ...open,
      provider_state: "pending",
      provider_reference: params.providerReference ?? open.provider_reference,
      updated_at: new Date().toISOString(),
    };
    const wf = upsertRefundRecord(workflow, next);
    const saved = await persistWorkflow(admin, row.id, row.booking_snapshot, wf, {});
    if (!saved.ok) return { ok: false, error: saved.error };
    return { ok: true, updated: true };
  }

  if (params.providerState === "failed") {
    const failedAt = new Date().toISOString();
    const next: BookingRefundRecord = {
      ...open,
      provider_state: "failed",
      provider_outcome: sanitizeProviderOutcome(params.note) ?? "provider_failed",
      updated_at: failedAt,
      failed_at: failedAt,
    };
    const wf = upsertRefundRecord(workflow, next);
    const saved = await persistWorkflow(admin, row.id, row.booking_snapshot, wf, {});
    if (!saved.ok) return { ok: false, error: saved.error };
    return { ok: true, updated: true };
  }

  // succeeded
  const result = await markRefundSucceeded(admin, row, workflow, open, {
    paystackRefunded: true,
    recordedOnly: false,
    alreadyReversedOnPaystack: false,
    refundReference: params.providerReference ?? open.provider_reference,
    kind: open.kind,
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, updated: true };
}

/**
 * Record a Paystack dispute/chargeback against a booking without calling refund API.
 */
export async function markBookingChargeback(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    paystackReference?: string | null;
    note?: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await admin
    .from("bookings")
    .select("id, status, refunded_at, refund_status")
    .eq("id", params.bookingId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "booking_not_found" };

  const existing = String((data as { refund_status?: string | null }).refund_status ?? "").toLowerCase();
  if (existing === "chargeback") return { ok: true };

  const nowIso = new Date().toISOString();
  const { error: upErr } = await admin
    .from("bookings")
    .update({
      refunded_at: (data as { refunded_at?: string | null }).refunded_at ?? nowIso,
      refund_status: "chargeback",
      payment_status: "refunded",
    })
    .eq("id", params.bookingId);
  if (upErr) return { ok: false, error: upErr.message };

  await maybeProcessReferralClawbackOnBookingChange({
    admin,
    bookingId: params.bookingId,
    newStatus: (data as { status?: string | null }).status,
    refundedAt: nowIso,
    refundStatus: "chargeback",
  });

  await logSystemEvent({
    level: "warn",
    source: "booking/chargeback",
    message: "booking.chargeback.recorded",
    context: {
      bookingId: params.bookingId,
      paystackReference: maskPaymentReference(params.paystackReference),
      note: params.note?.slice(0, 200) ?? null,
    },
  });

  return { ok: true };
}
