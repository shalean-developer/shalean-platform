import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { deliverPaymentAlreadyReceivedReceipt } from "@/lib/admin/deliverPaymentAlreadyReceivedReceipt";
import type { AdminMarkPaidMethod } from "@/lib/booking/adminMarkBookingPaid";
import { adminMarkBookingPaidOperation } from "@/lib/booking/bookingOperations";
import {
  syncPaidBookingSideEffects,
  type SyncPaidBookingInvoiceResult,
} from "@/lib/booking/syncPaidBookingSideEffects";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";

export type SettleAdminBookingPaymentAlreadyReceivedResult =
  | {
      ok: true;
      settlement: {
        amount_cents: number;
        method: AdminMarkPaidMethod;
        payment_reference_external: string | null;
        settlement_marker: string;
        preserved_paystack_reference: string | null;
      };
      invoice: SyncPaidBookingInvoiceResult;
      paid_confirmed: true;
      zero_balance_confirmed: boolean;
      receipt_email_sent: boolean;
      paid_invoice_included: boolean;
      receipt_kind: "paid_invoice" | "payment_confirmation_receipt";
      receipt_email_skipped_reason?: string;
      notification: {
        customerEmailSent: boolean;
        dedupeSkipped: boolean;
        failed: boolean;
        error?: string;
      };
    }
  | { ok: false; error: string; httpStatus: number; code?: string };

function zohoConfigured(): boolean {
  return Boolean(process.env.ZOHO_CLIENT_ID?.trim() && process.env.ZOHO_REFRESH_TOKEN?.trim());
}

/**
 * After an admin "Payment already received" booking insert (no Paystack link):
 *   1. Record verified off-platform payment via {@link adminMarkBookingPaidOperation}
 *   2. Create/sync the Zoho invoice and allocate payment ({@link syncPaidBookingSideEffects})
 *      — for `payment_method=zoho`, requires a Zoho invoice id and authoritative paid+zero read
 *   3. Confirm local paid status (+ zero outstanding balance when Zoho applies)
 *   4. Only then email a payment confirmation receipt (and paid invoice PDF when attached)
 *
 * Never sends unpaid invoices or payment-link / payment-recovery reminders.
 */
export async function settleAdminBookingPaymentAlreadyReceived(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    adminUserId: string;
    method: AdminMarkPaidMethod;
    reference?: string | null;
    amountCents: number;
    customerEmail: string;
  },
): Promise<SettleAdminBookingPaymentAlreadyReceivedResult> {
  const { bookingId, adminUserId, method, reference, amountCents, customerEmail } = params;

  const settle = await adminMarkBookingPaidOperation({
    admin,
    bookingId,
    adminUserId,
    method,
    reference: reference ?? null,
    amountCentsOverride: amountCents > 0 ? amountCents : null,
    settlementMode: "full",
    invoiceSync: "skip",
  });

  if (!settle.ok) {
    return {
      ok: false,
      error: settle.message,
      httpStatus: settle.httpStatus ?? 500,
      code: settle.code,
    };
  }

  const settleData = settle.data;
  if (!settleData) {
    return {
      ok: false,
      error: "Unexpected mark-paid result.",
      httpStatus: 500,
      code: "payment_already_received_settle_missing_data",
    };
  }

  if (settleData.variant === "deposit_recorded") {
    return {
      ok: false,
      error: "Payment already received requires full settlement, not a deposit.",
      httpStatus: 400,
      code: "payment_already_received_deposit_not_allowed",
    };
  }

  let settlementMarker = `cash_${bookingId}`;
  let paymentReferenceExternal: string | null = reference?.trim() ? reference.trim() : null;
  let preservedPaystackReference: string | null = null;
  let settledAmountCents = amountCents;

  if (settleData.variant === "full_skipped") {
    const { data: paidRow } = await admin
      .from("bookings")
      .select(
        "payment_completed_at, payment_status, amount_paid_cents, payment_method, payment_reference_external, paystack_reference",
      )
      .eq("id", bookingId)
      .maybeSingle();
    const row = paidRow as {
      payment_completed_at?: string | null;
      payment_status?: string | null;
      amount_paid_cents?: number | null;
      payment_method?: string | null;
      payment_reference_external?: string | null;
      paystack_reference?: string | null;
    } | null;
    if (!row?.payment_completed_at || String(row.payment_status ?? "").toLowerCase() !== "success") {
      return {
        ok: false,
        error: "Booking settlement did not confirm paid status.",
        httpStatus: 409,
        code: "payment_already_received_not_paid",
      };
    }
    settledAmountCents = Math.max(0, Math.round(Number(row.amount_paid_cents ?? amountCents)));
    paymentReferenceExternal =
      row.payment_reference_external != null && String(row.payment_reference_external).trim()
        ? String(row.payment_reference_external).trim()
        : paymentReferenceExternal;
    preservedPaystackReference =
      row.paystack_reference != null && String(row.paystack_reference).trim()
        ? String(row.paystack_reference).trim()
        : null;
    settlementMarker = preservedPaystackReference ?? settlementMarker;
  } else {
    const { settlement } = settleData;
    settledAmountCents = settlement.amount_cents;
    paymentReferenceExternal = settlement.payment_reference_external;
    settlementMarker = settlement.paystack_reference;
    preservedPaystackReference = settlement.preserved_paystack_reference;
  }

  const invoiceSync = await syncPaidBookingSideEffects(admin, {
    bookingId,
    reference: preservedPaystackReference ?? settlementMarker,
    amountCents: settledAmountCents,
  });

  const { data: confirmRow, error: confirmErr } = await admin
    .from("bookings")
    .select("payment_completed_at, payment_status, amount_paid_cents, zoho_invoice_id")
    .eq("id", bookingId)
    .maybeSingle();

  if (confirmErr || !confirmRow) {
    return {
      ok: false,
      error: confirmErr?.message ?? "Could not confirm paid booking state.",
      httpStatus: 500,
      code: "payment_already_received_confirm_failed",
    };
  }

  const confirmed = confirmRow as {
    payment_completed_at?: string | null;
    payment_status?: string | null;
    amount_paid_cents?: number | null;
    zoho_invoice_id?: string | null;
  };

  const locallyPaid =
    Boolean(confirmed.payment_completed_at && String(confirmed.payment_completed_at).trim()) &&
    String(confirmed.payment_status ?? "").toLowerCase() === "success" &&
    Math.round(Number(confirmed.amount_paid_cents ?? 0)) > 0;

  if (!locallyPaid) {
    return {
      ok: false,
      error: "Booking is not fully paid after settlement.",
      httpStatus: 409,
      code: "payment_already_received_unpaid_after_settle",
    };
  }

  let zeroBalanceConfirmed = false;

  if (invoiceSync.kind === "synced") {
    zeroBalanceConfirmed = invoiceSync.balanceCents === 0 && String(invoiceSync.status).toLowerCase() === "paid";
    if (!zeroBalanceConfirmed) {
      await logSystemEvent({
        level: "warn",
        source: "admin/payment_already_received",
        message: "invoice_balance_not_zero_after_allocate",
        context: {
          bookingId,
          zohoInvoiceId: invoiceSync.zohoInvoiceId,
          balanceCents: invoiceSync.balanceCents,
          status: invoiceSync.status,
        },
      });
      return {
        ok: false,
        error: "Invoice payment was recorded but outstanding balance is not zero. Receipt email was not sent.",
        httpStatus: 409,
        code: "payment_already_received_invoice_balance_nonzero",
      };
    }
  } else if (invoiceSync.kind === "failed") {
    // Zoho method always requires successful verification. Cash/EFT require it when Zoho is configured.
    if (method === "zoho" || zohoConfigured()) {
      return {
        ok: false,
        error: `Could not create or verify the paid invoice (${invoiceSync.error}). Receipt email was not sent.`,
        httpStatus: 502,
        code: "payment_already_received_invoice_sync_failed",
      };
    }
    zeroBalanceConfirmed = true;
  } else {
    // skipped — only allowed when Zoho is not configured (and method is not zoho).
    if (method === "zoho") {
      return {
        ok: false,
        error: `Zoho invoice verification was skipped (${invoiceSync.reason}). Receipt email was not sent.`,
        httpStatus: 502,
        code: "payment_already_received_zoho_verification_skipped",
      };
    }
    if (invoiceSync.reason !== "no_zoho_config" && zohoConfigured()) {
      return {
        ok: false,
        error: `Invoice sync skipped unexpectedly (${invoiceSync.reason}). Receipt email was not sent.`,
        httpStatus: 502,
        code: "payment_already_received_invoice_sync_skipped",
      };
    }
    zeroBalanceConfirmed = true;
  }

  const delivery = await deliverPaymentAlreadyReceivedReceipt(admin, {
    bookingId,
    customerEmail,
    amountCents: settledAmountCents,
    paymentReference: settlementMarker,
    zohoInvoiceId: invoiceSync.kind === "synced" ? invoiceSync.zohoInvoiceId : confirmed.zoho_invoice_id,
  });

  const receiptEmailSent = delivery.customerEmailSent === true;
  const receiptKind = delivery.paidInvoiceIncluded ? "paid_invoice" : "payment_confirmation_receipt";
  let receiptSkipReason: string | undefined;
  if (!receiptEmailSent) {
    receiptSkipReason = delivery.error ?? (delivery.dedupeSkipped ? "dedupe_skipped" : "customer_email_not_accepted");
    if (delivery.failed || !delivery.dedupeSkipped) {
      await reportOperationalIssue(
        "error",
        "admin/payment_already_received",
        `receipt_email_failed: ${receiptSkipReason}`,
        { bookingId },
      );
    }
  }

  void logSystemEvent({
    level: "info",
    source: "admin/payment_already_received",
    message: "payment_already_received_settled",
    context: {
      bookingId,
      method,
      amount_cents: settledAmountCents,
      invoice_kind: invoiceSync.kind,
      zero_balance_confirmed: zeroBalanceConfirmed,
      receipt_email_sent: receiptEmailSent,
      paid_invoice_included: delivery.paidInvoiceIncluded,
      receipt_kind: receiptKind,
      notification_dedupe_skipped: delivery.dedupeSkipped,
    },
  });

  return {
    ok: true,
    settlement: {
      amount_cents: settledAmountCents,
      method,
      payment_reference_external: paymentReferenceExternal,
      settlement_marker: settlementMarker,
      preserved_paystack_reference: preservedPaystackReference,
    },
    invoice: invoiceSync,
    paid_confirmed: true,
    zero_balance_confirmed: zeroBalanceConfirmed,
    receipt_email_sent: receiptEmailSent,
    paid_invoice_included: delivery.paidInvoiceIncluded,
    receipt_kind: receiptKind,
    ...(receiptSkipReason ? { receipt_email_skipped_reason: receiptSkipReason } : {}),
    notification: {
      customerEmailSent: delivery.customerEmailSent,
      dedupeSkipped: delivery.dedupeSkipped,
      failed: delivery.failed,
      ...(delivery.error ? { error: delivery.error } : {}),
    },
  };
}
