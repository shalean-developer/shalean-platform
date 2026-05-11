import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { metrics } from "@/lib/metrics/counters";

/**
 * Result of bumping the cleaner-offer-sent counter.
 * - `ok`: always reflects whether the row update succeeded.
 * - `kind`: classification used by callers/tests:
 *     * `success`        — RPC returned no error.
 *     * `missing_column` — RPC failed because public.cleaners is missing a
 *                         counter column (Postgres SQLSTATE 42703). This is a
 *                         schema config gap (see migration
 *                         `20260932_dispatch_offer_counters_idempotent.sql`),
 *                         not a runtime fault: offer creation MUST continue.
 *     * `other`          — Any other RPC error.
 */
export type DispatchOfferSentRpcResult =
  | { ok: true; kind: "success" }
  | { ok: false; kind: "missing_column"; message: string }
  | { ok: false; kind: "other"; message: string };

const POSTGRES_UNDEFINED_COLUMN_CODE = "42703";

function classifyRpcError(err: { message?: string; code?: string } | null | undefined): "missing_column" | "other" {
  if (!err) return "other";
  if (err.code === POSTGRES_UNDEFINED_COLUMN_CODE) return "missing_column";
  const msg = String(err.message ?? "").toLowerCase();
  if (msg.includes("does not exist") && msg.includes("column")) return "missing_column";
  return "other";
}

/**
 * Bump `cleaners.total_offers` atomically via the
 * `public.dispatch_cleaner_offer_sent` RPC. Never throws — failures are
 * logged and a metric is emitted so that offer creation continues even when
 * the counter schema is mid-migration.
 */
export async function bumpCleanerOfferSentCounter(params: {
  supabase: SupabaseClient;
  cleanerId: string;
  bookingId: string;
  offerId: string;
}): Promise<DispatchOfferSentRpcResult> {
  try {
    const { error } = await params.supabase.rpc("dispatch_cleaner_offer_sent", {
      p_cleaner_id: params.cleanerId,
    });

    if (!error) {
      return { ok: true, kind: "success" };
    }

    const kind = classifyRpcError(error);
    const message = String(error.message ?? "dispatch_cleaner_offer_sent rpc failed");

    if (kind === "missing_column") {
      metrics.increment("dispatch.offer.counter_rpc_schema_gap", {
        cleanerId: params.cleanerId,
        bookingId: params.bookingId,
      });
      // Downgrade to info: the column gap is a deployment/migration issue, not
      // a runtime warning that should page on every offer.
      await logSystemEvent({
        level: "info",
        source: "dispatch_offer_sent_rpc_schema_gap",
        message,
        context: {
          bookingId: params.bookingId,
          cleanerId: params.cleanerId,
          offerId: params.offerId,
          remediation: "Apply migration 20260932_dispatch_offer_counters_idempotent.sql",
        },
      });
      return { ok: false, kind: "missing_column", message };
    }

    await logSystemEvent({
      level: "warn",
      source: "dispatch_offer_sent_rpc",
      message,
      context: {
        bookingId: params.bookingId,
        cleanerId: params.cleanerId,
        offerId: params.offerId,
      },
    });
    return { ok: false, kind: "other", message };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logSystemEvent({
      level: "warn",
      source: "dispatch_offer_sent_rpc_exception",
      message,
      context: {
        bookingId: params.bookingId,
        cleanerId: params.cleanerId,
        offerId: params.offerId,
      },
    });
    return { ok: false, kind: "other", message };
  }
}
