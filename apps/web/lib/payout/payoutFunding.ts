import type { SupabaseClient } from "@supabase/supabase-js";
import { bookingUsesAccrualPayoutCap } from "@/lib/payout/bookingPayoutCapCents";
import type { CleanerPayoutBatchItem } from "@/lib/payout/loadCleanerPayoutBatchItems";

export type CleanerPayoutFundingSummary = {
  payoutId: string;
  liabilityCents: number;
  fundedCents: number;
  fundingGapCents: number;
  fundedItemCount: number;
  unfundedItemCount: number;
  unfundedBookingIds: string[];
};

type FundingBookingRow = {
  id: string;
  billing_type: string | null;
  is_monthly_billing_booking: boolean | null;
  monthly_invoice_id: string | null;
  payment_status: string | null;
  refunded_at: string | null;
  refund_status: string | null;
};

function norm(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function prepaidPaymentCollected(paymentStatus: string | null | undefined): boolean {
  const status = norm(paymentStatus);
  return status === "success" || status === "paid" || status === "succeeded";
}

export function bookingFundingCollected(
  booking: FundingBookingRow,
  invoiceStatusById: Map<string, string>,
): boolean {
  if (booking.refunded_at || ["refunded", "reversed", "failed"].includes(norm(booking.refund_status))) return false;

  if (bookingUsesAccrualPayoutCap(booking)) {
    const invoiceId = String(booking.monthly_invoice_id ?? "").trim();
    if (!invoiceId) return false;
    return norm(invoiceStatusById.get(invoiceId)) === "paid" && norm(booking.payment_status) === "success";
  }

  return prepaidPaymentCollected(booking.payment_status);
}

/**
 * Calculates whether the customer cash backing a cleaner payout has actually been collected.
 *
 * This is deliberately separate from earnings accrual: a cleaner can have earned money while the
 * corresponding monthly customer invoice is still draft/sent. Approval/payment must use this funding
 * read model rather than assuming "earned" means "cash available".
 */
export async function loadCleanerPayoutFunding(
  admin: SupabaseClient,
  payoutId: string,
  items: readonly CleanerPayoutBatchItem[],
): Promise<{ summary: CleanerPayoutFundingSummary | null; error: string | null }> {
  const liabilityCents = items.reduce((sum, item) => sum + Math.max(0, item.payout_cents + item.bonus_cents), 0);
  const bookingIds = [...new Set(items.map((item) => item.booking_id).filter(Boolean))];
  if (!bookingIds.length) {
    return {
      summary: {
        payoutId,
        liabilityCents,
        fundedCents: 0,
        fundingGapCents: liabilityCents,
        fundedItemCount: 0,
        unfundedItemCount: items.length,
        unfundedBookingIds: [],
      },
      error: null,
    };
  }

  const { data: bookingRows, error: bookingErr } = await admin
    .from("bookings")
    .select("id, billing_type, is_monthly_billing_booking, monthly_invoice_id, payment_status, refunded_at, refund_status")
    .in("id", bookingIds);
  if (bookingErr) return { summary: null, error: bookingErr.message };

  const bookingById = new Map<string, FundingBookingRow>();
  const invoiceIds: string[] = [];
  for (const raw of bookingRows ?? []) {
    const row = raw as FundingBookingRow;
    if (!row.id) continue;
    bookingById.set(row.id, row);
    const invoiceId = String(row.monthly_invoice_id ?? "").trim();
    if (invoiceId) invoiceIds.push(invoiceId);
  }

  const invoiceStatusById = new Map<string, string>();
  const uniqueInvoiceIds = [...new Set(invoiceIds)];
  if (uniqueInvoiceIds.length) {
    const { data: invoiceRows, error: invoiceErr } = await admin
      .from("monthly_invoices")
      .select("id, status")
      .in("id", uniqueInvoiceIds);
    if (invoiceErr) return { summary: null, error: invoiceErr.message };
    for (const raw of invoiceRows ?? []) {
      const row = raw as { id?: string; status?: string | null };
      if (row.id) invoiceStatusById.set(row.id, String(row.status ?? ""));
    }
  }

  let fundedCents = 0;
  let fundedItemCount = 0;
  let unfundedItemCount = 0;
  const unfundedBookingIds = new Set<string>();

  for (const item of items) {
    const itemCents = Math.max(0, item.payout_cents + item.bonus_cents);
    const booking = bookingById.get(item.booking_id);
    if (booking && bookingFundingCollected(booking, invoiceStatusById)) {
      fundedCents += itemCents;
      fundedItemCount += 1;
    } else {
      unfundedItemCount += 1;
      if (item.booking_id) unfundedBookingIds.add(item.booking_id);
    }
  }

  fundedCents = Math.min(liabilityCents, fundedCents);
  return {
    summary: {
      payoutId,
      liabilityCents,
      fundedCents,
      fundingGapCents: Math.max(0, liabilityCents - fundedCents),
      fundedItemCount,
      unfundedItemCount,
      unfundedBookingIds: [...unfundedBookingIds],
    },
    error: null,
  };
}
