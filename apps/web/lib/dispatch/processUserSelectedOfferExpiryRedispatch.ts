import type { SupabaseClient } from "@supabase/supabase-js";
import { FALLBACK_REASON_CLEANER_OFFER_EXPIRED } from "@/lib/booking/fallbackReason";
import { maxDispatchAttempts } from "@/lib/dispatch/dispatchAttemptLimits";
import {
  DEFAULT_DISPATCH_RECOVERY_LEASE_SECONDS,
  releaseDispatchRecoveryLease,
  tryClaimDispatchRecoveryLease,
} from "@/lib/dispatch/dispatchRecoveryLease";
import { maybeRedispatchPendingBookingIfOffersExhausted } from "@/lib/dispatch/redispatchAfterOfferReject";
import {
  USER_SELECTED_RECOVERY_MAX_PAGES,
  USER_SELECTED_RECOVERY_PAGE_SIZE,
} from "@/lib/dispatch/userSelectedRecoveryPaging";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";

/** Runs SQL TTL expiry on `dispatch_offers` (same as pg cron). Service role only. */
export async function expireStaleDispatchOffersRpc(
  supabase: SupabaseClient,
): Promise<{ ok: boolean; raw?: unknown; error?: string }> {
  const { data, error } = await supabase.rpc("expire_pending_dispatch_offers", { p_limit: 200 });
  if (error) return { ok: false, error: error.message };
  return { ok: true, raw: data };
}

/**
 * After SQL expiry, user-selected bookings with no pending offers must recover (cleaner ignored TTL).
 * Invokes the same path as decline → `maybeRedispatchPendingBookingIfOffersExhausted`.
 *
 * Eligibility uses `list_bookings_due_user_selected_recovery` so `dispatch_next_recovery_at` is compared with DB `now()`
 * (same clock story as the lease RPC). Any remaining app vs DB skew elsewhere is typically ±2–3s — negligible vs backoff.
 */
export async function processUserSelectedOfferExpiryRedispatch(
  supabase: SupabaseClient,
): Promise<{ scanned: number; invoked: number }> {
  const max = maxDispatchAttempts();

  let scanned = 0;
  let invoked = 0;
  /** Per cron tick: skip duplicate ids if the same booking appears on a later page (offset edge cases). */
  const processedThisRun = new Set<string>();

  for (let page = 0; page < USER_SELECTED_RECOVERY_MAX_PAGES; page++) {
    const p_offset = page * USER_SELECTED_RECOVERY_PAGE_SIZE;
    const { data: rows, error: bErr } = await supabase.rpc("list_bookings_due_user_selected_recovery", {
      p_max_attempts: max,
      p_limit: USER_SELECTED_RECOVERY_PAGE_SIZE,
      p_offset,
    });

    if (bErr) {
      await reportOperationalIssue("warn", "processUserSelectedOfferExpiry", bErr.message);
      return { scanned: 0, invoked: 0 };
    }

    const rowList = (rows ?? []) as Array<{ id?: string; selected_cleaner_id?: string | null }>;
    scanned += rowList.length;

    for (const raw of rowList) {
      const id = String(raw?.id ?? "").trim();
      const sid = String(raw?.selected_cleaner_id ?? "").trim();
      if (!id || !sid) continue;
      if (processedThisRun.has(id)) continue;

      const claimed = await tryClaimDispatchRecoveryLease(supabase, id, {
        leaseSeconds: DEFAULT_DISPATCH_RECOVERY_LEASE_SECONDS,
      });
      if (!claimed) continue;

      try {
        await maybeRedispatchPendingBookingIfOffersExhausted(supabase, {
          bookingId: id,
          rejectedCleanerId: sid,
          reassignmentFallbackReason: FALLBACK_REASON_CLEANER_OFFER_EXPIRED,
          skipBackoffScheduling: false,
        });
        invoked++;
      } finally {
        await releaseDispatchRecoveryLease(supabase, id);
      }
      processedThisRun.add(id);
    }

    if (rowList.length < USER_SELECTED_RECOVERY_PAGE_SIZE) break;
  }

  return { scanned, invoked };
}

export async function runOfferExpiryMaintenance(supabase: SupabaseClient): Promise<{
  expireRpc: { ok: boolean; error?: string; raw?: unknown };
  userSelectedRedispatch: { scanned: number; invoked: number };
}> {
  const expireRpc = await expireStaleDispatchOffersRpc(supabase);
  const userSelectedRedispatch = expireRpc.ok
    ? await processUserSelectedOfferExpiryRedispatch(supabase)
    : { scanned: 0, invoked: 0 };

  await logSystemEvent({
    level: "info",
    source: "dispatch_offer_expiry_maintenance",
    message: "Offer expiry RPC + user-selected redispatch sweep",
    context: {
      expireRpcOk: expireRpc.ok,
      expireRpcError: expireRpc.error ?? null,
      scanned: userSelectedRedispatch.scanned,
      invoked: userSelectedRedispatch.invoked,
    },
  });

  return { expireRpc, userSelectedRedispatch };
}
