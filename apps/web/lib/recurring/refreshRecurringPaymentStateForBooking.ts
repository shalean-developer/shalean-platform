import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { recurringAutoChargeMaxRetries } from "@/lib/recurring/autoChargeRetryPolicy";
import { deriveRecurringPaymentState } from "@/lib/recurring/deriveRecurringPaymentState";
import { reportOperationalIssue } from "@/lib/logging/systemLog";

/**
 * Recomputes `bookings.payment_state` from canonical columns + `recurring_bookings.paystack_authorization_code`.
 *
 * **M-7 (May 2026)**: when `bookings.recurring_id` is set but the referenced `recurring_bookings`
 * row is missing (deleted plan, broken reference, schema drift), we now emit a `warn`-level
 * operational issue so ops can repair the data instead of silently treating the orphan as a
 * fresh plan with no auth code. The function still completes — refusing to refresh would block
 * other side-effects on the booking row — but the orphan signal is now observable.
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
    const { data: rec, error: recErr } = await admin
      .from("recurring_bookings")
      .select("paystack_authorization_code")
      .eq("id", rid)
      .maybeSingle();
    /**
     * **M-7**: distinguish "missing plan" (`rec === null` with no error) from "transient DB
     * error" (`recErr` set). Only the former is a true orphan worth alerting on; transient
     * errors are logged at warn level but do not change refresh behaviour. Both branches still
     * fall through to a `null` auth code so we never produce a stale `payment_state` from an
     * unverified plan row.
     */
    if (recErr) {
      await reportOperationalIssue(
        "warn",
        "refreshRecurringPaymentStateForBooking",
        "recurring_plan_lookup_failed",
        {
          bookingId,
          recurringId: rid,
          errorType: "recurring_plan_lookup_failed",
          error: String(recErr.message ?? "").slice(0, 500) || null,
        },
      );
    } else if (!rec) {
      await reportOperationalIssue(
        "warn",
        "refreshRecurringPaymentStateForBooking",
        "orphan_recurring_id_detected",
        {
          bookingId,
          recurringId: rid,
          errorType: "orphan_recurring_id",
          remediation:
            "bookings.recurring_id points to a missing/deleted recurring_bookings row. " +
            "Either restore the plan, or null out bookings.recurring_id and reset is_recurring_generated.",
        },
      );
    }
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
