import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveBookingOwnershipColumn } from "@/lib/customer/customerBookingsForUser";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { releaseCleaningCreditForBooking } from "@/lib/referrals/creditReservations";
import { fetchPaystackTransactionVerify } from "@/lib/payments/verifyPaystackTransaction";
import { expirePendingPaymentTerminal } from "@/lib/booking/expirePendingPaymentTerminal";

const PAYMENT_EDIT_SUPERSEDED_REASON = "customer_edit_after_checkout";

type BookingRow = {
  id: string;
  status?: string | null;
  payment_status?: string | null;
  payment_completed_at?: string | null;
  paystack_reference?: string | null;
  booking_snapshot?: unknown;
  total_price?: number | string | null;
  customer_id?: string | null;
  user_id?: string | null;
  [key: string]: unknown;
};

type SupersedeMarker = {
  reason: typeof PAYMENT_EDIT_SUPERSEDED_REASON;
  superseded_at: string;
  paystack_reference: string | null;
  cleanup_done_at?: string | null;
};

export type AbandonPendingPaymentForEditResult =
  | {
      ok: true;
      bookingId: string;
      alreadySuperseded: boolean;
    }
  | {
      ok: false;
      code:
        | "BOOKING_NOT_FOUND"
        | "BOOKING_ACCESS_DENIED"
        | "PAYMENT_ALREADY_COMPLETED"
        | "PAYMENT_NOT_EDITABLE"
        | "PAYMENT_EDIT_SUPERSEDE_FAILED"
        | "PAYMENT_EDIT_CLEANUP_FAILED";
      error: string;
    };

function snapshotRecord(snapshot: unknown): Record<string, unknown> {
  return snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? { ...(snapshot as Record<string, unknown>) }
    : {};
}

function supersedeMarker(snapshot: unknown): SupersedeMarker | null {
  const record = snapshotRecord(snapshot);
  const marker = record.payment_edit_superseded;
  if (!marker || typeof marker !== "object" || Array.isArray(marker)) return null;
  const parsed = marker as Record<string, unknown>;
  if (parsed.reason !== PAYMENT_EDIT_SUPERSEDED_REASON) return null;
  const supersededAt = typeof parsed.superseded_at === "string" ? parsed.superseded_at : "";
  if (!supersededAt) return null;
  return {
    reason: PAYMENT_EDIT_SUPERSEDED_REASON,
    superseded_at: supersededAt,
    paystack_reference:
      typeof parsed.paystack_reference === "string" && parsed.paystack_reference.trim()
        ? parsed.paystack_reference.trim()
        : null,
    cleanup_done_at:
      typeof parsed.cleanup_done_at === "string" && parsed.cleanup_done_at.trim()
        ? parsed.cleanup_done_at.trim()
        : null,
  };
}

export function isPaymentEditSupersededSnapshot(snapshot: unknown): boolean {
  return supersedeMarker(snapshot) != null;
}

function bookingLooksPaid(row: BookingRow): boolean {
  if (typeof row.payment_completed_at === "string" && row.payment_completed_at.trim()) return true;
  const paymentStatus = String(row.payment_status ?? "").trim().toLowerCase();
  return paymentStatus === "paid" || paymentStatus === "success";
}

function bookingRevenueZar(row: BookingRow): number {
  const raw = Number(row.total_price ?? 0);
  return Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : 0;
}

async function reverseAppliedPromotionRedemptions(
  admin: SupabaseClient,
  bookingId: string,
  oldBookingRevenueZar: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: reversed, error } = await admin
    .from("promotion_redemptions")
    .update({ status: "reversed" })
    .eq("booking_id", bookingId)
    .eq("status", "applied")
    .select("promotion_id, discount_zar");

  if (error) {
    return { ok: false, error: error.message };
  }

  // Keep promotion-level counters aligned with the released checkout. Customer
  // eligibility already ignores rows once they are marked reversed; these
  // counter repairs are best-effort because another redemption can race us.
  for (const row of reversed ?? []) {
    const promotionId = typeof row.promotion_id === "string" ? row.promotion_id.trim() : "";
    if (!promotionId) continue;
    const discountZar = Math.max(0, Number(row.discount_zar ?? 0));

    const { data: promotion } = await admin
      .from("promotions")
      .select("redemptions_count, budget_spent_zar, revenue_generated_zar")
      .eq("id", promotionId)
      .maybeSingle();
    if (!promotion) continue;

    const previousCount = Math.max(0, Number(promotion.redemptions_count ?? 0));
    const { error: counterError } = await admin
      .from("promotions")
      .update({
        redemptions_count: Math.max(0, previousCount - 1),
        budget_spent_zar: Math.max(0, Number(promotion.budget_spent_zar ?? 0) - discountZar),
        revenue_generated_zar: Math.max(
          0,
          Number(promotion.revenue_generated_zar ?? 0) - oldBookingRevenueZar,
        ),
        updated_at: new Date().toISOString(),
      })
      .eq("id", promotionId)
      .eq("redemptions_count", previousCount);

    if (counterError) {
      void reportOperationalIssue(
        "warn",
        "abandonPendingPaymentForEdit/promotionCounter",
        counterError.message,
        { bookingId, promotionId },
      );
    }
  }

  return { ok: true };
}

async function cleanupSupersededCheckout(
  admin: SupabaseClient,
  row: BookingRow,
  options?: { creditAlreadyReleased?: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!options?.creditAlreadyReleased) {
    const creditRelease = await releaseCleaningCreditForBooking(admin, row.id);
    if (!creditRelease.ok && creditRelease.error !== "reservation_not_found") {
      return { ok: false, error: `Cleaning Credit release failed: ${creditRelease.error}` };
    }
  }

  const promotionRelease = await reverseAppliedPromotionRedemptions(
    admin,
    row.id,
    bookingRevenueZar(row),
  );
  if (!promotionRelease.ok) {
    return { ok: false, error: `Promotion release failed: ${promotionRelease.error}` };
  }

  // A pending recurring package has not been activated or allocated yet. Removing
  // it prevents the abandoned checkout from competing with the freshly requoted one.
  const { error: recurringDeleteError } = await admin
    .from("recurring_prepaid_packages")
    .delete()
    .eq("source_booking_id", row.id)
    .eq("status", "pending_payment");
  if (recurringDeleteError) {
    void reportOperationalIssue(
      "warn",
      "abandonPendingPaymentForEdit/recurringPrepayment",
      recurringDeleteError.message,
      { bookingId: row.id },
    );
  }

  return { ok: true };
}

/**
 * Customer intent boundary used when leaving Booking V2 Payment to edit the draft.
 *
 * The old Paystack attempt remains identifiable by reference for audit/replay
 * rejection, but the booking itself is made non-payable and its stored checkout
 * URL is cleared before the browser is allowed to resume editable pricing.
 */
export async function abandonPendingPaymentForEdit(
  admin: SupabaseClient,
  params: { bookingId: string; userId: string },
): Promise<AbandonPendingPaymentForEditResult> {
  const bookingId = params.bookingId.trim();
  const userId = params.userId.trim();
  const ownershipColumn = await resolveBookingOwnershipColumn(admin);

  const { data, error } = await admin
    .from("bookings")
    .select(
      `id, status, payment_status, payment_completed_at, paystack_reference, booking_snapshot, total_price, ${ownershipColumn}`,
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (error) {
    return { ok: false, code: "PAYMENT_EDIT_SUPERSEDE_FAILED", error: error.message };
  }
  if (!data) {
    return {
      ok: false,
      code: "BOOKING_NOT_FOUND",
      error: "We could not find the saved booking payment.",
    };
  }

  const row = data as BookingRow;
  const ownerId = typeof row[ownershipColumn] === "string" ? String(row[ownershipColumn]).trim() : "";
  if (!ownerId || ownerId !== userId) {
    return {
      ok: false,
      code: "BOOKING_ACCESS_DENIED",
      error: "This booking does not belong to the signed-in customer.",
    };
  }

  if (bookingLooksPaid(row)) {
    return {
      ok: false,
      code: "PAYMENT_ALREADY_COMPLETED",
      error: "This payment has already completed. Open your confirmed booking instead of editing this checkout.",
    };
  }

  // Do not supersede a checkout solely from our local row. A charge can complete
  // at Paystack just before its callback/webhook reaches Shalean. Verify the
  // gateway reference before making the old booking non-payable so a successful
  // payment racing with "edit booking" remains recoverable by the normal
  // finalization path.
  const reference =
    typeof row.paystack_reference === "string" ? row.paystack_reference.trim() : "";
  if (reference) {
    const secret = process.env.PAYSTACK_SECRET_KEY?.trim() ?? "";
    if (!secret) {
      return {
        ok: false,
        code: "PAYMENT_EDIT_SUPERSEDE_FAILED",
        error: "Payment verification is temporarily unavailable. Please try again before editing this checkout.",
      };
    }
    const verified = await fetchPaystackTransactionVerify(reference, secret);
    if (!verified.status) {
      return {
        ok: false,
        code: "PAYMENT_EDIT_SUPERSEDE_FAILED",
        error: "We could not safely verify the previous payment. Please try again before editing this checkout.",
      };
    }
    const gatewayStatus = String(verified.data?.status ?? "").trim().toLowerCase();
    if (gatewayStatus === "success") {
      return {
        ok: false,
        code: "PAYMENT_ALREADY_COMPLETED",
        error: "This payment has already completed. Open your confirmed booking instead of editing this checkout.",
      };
    }
  }

  const existingMarker = supersedeMarker(row.booking_snapshot);
  if (row.status === "payment_expired" && existingMarker) {
    if (!existingMarker.cleanup_done_at) {
      const cleanup = await cleanupSupersededCheckout(admin, row);
      if (!cleanup.ok) {
        return {
          ok: false,
          code: "PAYMENT_EDIT_CLEANUP_FAILED",
          error: cleanup.error,
        };
      }
      const snapshot = snapshotRecord(row.booking_snapshot);
      snapshot.payment_edit_superseded = {
        ...existingMarker,
        cleanup_done_at: new Date().toISOString(),
      };
      await admin.from("bookings").update({ booking_snapshot: snapshot }).eq("id", bookingId);
    }
    return { ok: true, bookingId, alreadySuperseded: true };
  }

  if (row.status !== "pending_payment") {
    return {
      ok: false,
      code: "PAYMENT_NOT_EDITABLE",
      error: "This booking is no longer waiting for payment and cannot be replaced from checkout.",
    };
  }

  const nowIso = new Date().toISOString();
  const snapshot = snapshotRecord(row.booking_snapshot);
  snapshot.payment_edit_superseded = {
    reason: PAYMENT_EDIT_SUPERSEDED_REASON,
    superseded_at: nowIso,
    paystack_reference:
      typeof row.paystack_reference === "string" && row.paystack_reference.trim()
        ? row.paystack_reference.trim()
        : null,
    cleanup_done_at: null,
  } satisfies SupersedeMarker;

  const terminal = await expirePendingPaymentTerminal(admin, {
    bookingId,
    reason: PAYMENT_EDIT_SUPERSEDED_REASON,
    paymentNeedsFollowUp: false,
    extraPatch: {
      payment_link_expires_at: null,
      booking_snapshot: snapshot,
    },
  });

  if (!terminal.ok || !terminal.transitioned) {
    return {
      ok: false,
      code: terminal.ok ? "PAYMENT_EDIT_SUPERSEDE_FAILED" : "PAYMENT_EDIT_CLEANUP_FAILED",
      error: terminal.ok
        ? "The previous payment attempt changed while we were preparing your edit. Please try again."
        : terminal.error,
    };
  }

  const cleanup = await cleanupSupersededCheckout(admin, row, { creditAlreadyReleased: true });
  if (!cleanup.ok) {
    return {
      ok: false,
      code: "PAYMENT_EDIT_CLEANUP_FAILED",
      error: cleanup.error,
    };
  }

  snapshot.payment_edit_superseded = {
    ...(snapshot.payment_edit_superseded as SupersedeMarker),
    cleanup_done_at: new Date().toISOString(),
  };
  const { error: markerError } = await admin
    .from("bookings")
    .update({ booking_snapshot: snapshot })
    .eq("id", bookingId)
    .eq("status", "payment_expired");
  if (markerError) {
    void reportOperationalIssue(
      "warn",
      "abandonPendingPaymentForEdit/cleanupMarker",
      markerError.message,
      { bookingId },
    );
  }

  return { ok: true, bookingId, alreadySuperseded: false };
}
