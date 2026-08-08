import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { refreshRecurringBookingPaymentState } from "@/lib/booking/bookingOperations";
import {
  resolveCleanerEarningsCents,
  resolveCleanerFrozenCentsForSettlement,
} from "@/lib/cleaner/resolveCleanerEarnings";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { allocateMonthlyChildPaymentCents } from "@/lib/monthlyInvoice/allocateMonthlyChildPaymentCents";
import { settleMonthlyInvoiceChildBooking } from "@/lib/monthlyInvoice/settleMonthlyInvoiceChildBooking";

export type MonthlyInvoiceSettlementChildRow = {
  id: string;
  total_paid_zar: number | null;
  amount_paid_cents: number | null;
  display_earnings_cents: number | null;
  cleaner_payout_cents: number | null;
};

export type MonthlyInvoiceChildSettlementFailure = {
  bookingId: string;
  error: string;
};

export type SettleMonthlyInvoiceChildrenResult =
  | {
      ok: true;
      invoiceId: string;
      attempted: number;
      settled: number;
      failed: 0;
      failures: [];
    }
  | {
      ok: false;
      invoiceId: string;
      attempted: number;
      settled: number;
      failed: number;
      failures: MonthlyInvoiceChildSettlementFailure[];
      error: string;
    };

export async function settleMonthlyInvoiceChildren(
  admin: SupabaseClient,
  params: {
    invoiceId: string;
    children: readonly MonthlyInvoiceSettlementChildRow[];
    source: string;
    reference?: string | null;
    refreshPaymentState?: boolean;
  },
): Promise<SettleMonthlyInvoiceChildrenResult> {
  const failures: MonthlyInvoiceChildSettlementFailure[] = [];
  let settled = 0;

  for (const b of params.children) {
    const allocatedCents = allocateMonthlyChildPaymentCents({
      total_paid_zar: b.total_paid_zar,
      amount_paid_cents: b.amount_paid_cents,
    });
    let frozen = resolveCleanerFrozenCentsForSettlement({
      display_earnings_cents: b.display_earnings_cents,
      cleaner_payout_cents: b.cleaner_payout_cents,
    });

    // Legacy rows can carry a zero display/payout field while the canonical
    // booking-wide earnings total is positive. Do not strand a paid monthly
    // invoice child in pending_monthly because of that narrower legacy shape.
    // Reuse the existing P1 earnings resolver instead of inventing a second rule.
    if (frozen == null || frozen <= 0) {
      const { data: basisRow } = await admin
        .from("bookings")
        .select("cleaner_earnings_total_cents")
        .eq("id", b.id)
        .maybeSingle();
      frozen = resolveCleanerEarningsCents({
        display_earnings_cents: b.display_earnings_cents,
        cleaner_payout_cents: b.cleaner_payout_cents,
        cleaner_earnings_total_cents: basisRow?.cleaner_earnings_total_cents,
      });
    }

    if (frozen == null || frozen <= 0) {
      const error = `booking_missing_cleaner_earnings_basis:${b.id}`;
      failures.push({ bookingId: b.id, error });
      await logSystemEvent({
        level: "error",
        source: params.source,
        message: "monthly_invoice_booking_missing_cleaner_frozen_basis",
        context: { invoice_id: params.invoiceId, booking_id: b.id, reference: params.reference ?? null },
      });
      continue;
    }

    const res = await settleMonthlyInvoiceChildBooking(admin, {
      bookingId: b.id,
      amountPaidCents: allocatedCents,
      payoutFrozenCents: frozen,
    });
    if (!res.ok) {
      failures.push({ bookingId: b.id, error: res.error });
      await logSystemEvent({
        level: "error",
        source: params.source,
        message: "monthly_invoice_booking_settlement_failed",
        context: { invoice_id: params.invoiceId, booking_id: b.id, reference: params.reference ?? null, error: res.error },
      });
      continue;
    }

    settled++;
    if (params.refreshPaymentState !== false) {
      await refreshRecurringBookingPaymentState({ admin, bookingId: b.id });
    }
  }

  if (failures.length > 0) {
    const error = `monthly_invoice_child_settlement_partial:${params.invoiceId}:settled=${settled}:failed=${failures.length}`;
    await logSystemEvent({
      level: "error",
      source: params.source,
      message: "monthly_invoice_child_settlement_partial",
      context: {
        invoice_id: params.invoiceId,
        reference: params.reference ?? null,
        attempted: params.children.length,
        settled,
        failed: failures.length,
        failures,
      },
    });
    return {
      ok: false,
      invoiceId: params.invoiceId,
      attempted: params.children.length,
      settled,
      failed: failures.length,
      failures,
      error,
    };
  }

  return {
    ok: true,
    invoiceId: params.invoiceId,
    attempted: params.children.length,
    settled,
    failed: 0,
    failures: [],
  };
}
