import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { recurringAutoChargeMaxRetries } from "@/lib/recurring/autoChargeRetryPolicy";
import { deriveRecurringPaymentState } from "@/lib/recurring/deriveRecurringPaymentState";

/**
 * Recomputes `bookings.payment_state` from canonical columns + `recurring_bookings.paystack_authorization_code`.
 */
export async function refreshRecurringPaymentStateForBooking(
  admin: SupabaseClient,
  bookingId: string,
): Promise<void> {
  const { data: b, error } = await admin
    .from("bookings")
    .select(
      "id, is_recurring_generated, status, payment_status, recurring_id, recurring_retry_count, recurring_next_charge_attempt_at, recurring_first_failure_at, recurring_fallback_at",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (error || !b || typeof b !== "object") return;

  const row = b as Record<string, unknown>;
  if (!row.is_recurring_generated) {
    await admin.from("bookings").update({ payment_state: null }).eq("id", bookingId);
    return;
  }

  let authCode: string | null = null;
  const ridRaw = row.recurring_id;
  const rid = typeof ridRaw === "string" && /^[0-9a-f-]{36}$/i.test(ridRaw) ? ridRaw : "";
  if (rid) {
    const { data: rec } = await admin
      .from("recurring_bookings")
      .select("paystack_authorization_code")
      .eq("id", rid)
      .maybeSingle();
    const code = (rec as { paystack_authorization_code?: string | null } | null)?.paystack_authorization_code;
    authCode = typeof code === "string" && code.trim() ? code.trim() : null;
  }

  const derived = deriveRecurringPaymentState(
    {
      is_recurring_generated: Boolean(row.is_recurring_generated),
      status: row.status != null ? String(row.status) : null,
      payment_status: row.payment_status != null ? String(row.payment_status) : null,
      recurring_retry_count: typeof row.recurring_retry_count === "number" ? row.recurring_retry_count : null,
      recurring_next_charge_attempt_at:
        row.recurring_next_charge_attempt_at != null ? String(row.recurring_next_charge_attempt_at) : null,
      recurring_first_failure_at:
        row.recurring_first_failure_at != null ? String(row.recurring_first_failure_at) : null,
      recurring_fallback_at: row.recurring_fallback_at != null ? String(row.recurring_fallback_at) : null,
    },
    authCode,
    recurringAutoChargeMaxRetries(),
  );

  await admin.from("bookings").update({ payment_state: derived }).eq("id", bookingId);
}
