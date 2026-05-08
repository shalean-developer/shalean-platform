import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";
import { bookingMatchesRecurringCleanerPendingPayment } from "@/lib/cleaner/cleanerBookingAccess";

/**
 * Single derived lifecycle phase from authoritative DB fields (`bookings.status`, `completed_at`)
 * plus `cleaner_response_status` / timestamps only **after** completion and terminal status checks.
 *
 * **Completed** is defined ONLY as:
 * - `lower(trim(status)) === "completed"`, OR
 * - `completed_at` is non-empty
 *
 * Never infer completion from `cleaner_response_status`, duration, or expected finish.
 */
export type BookingOperationalPhase =
  | "pending"
  | "assigned"
  | "accepted"
  | "travelling"
  | "active"
  | "completed"
  | "cancelled"
  | "failed"
  | "expired"
  /** Unpaid checkout / link; not recurring per cleaner visibility rules. */
  | "pending_payment"
  /** Recurring or invoice-backed unpaid visit (same signals as cleaner list policy). */
  | "pending_payment_recurring"
  | "unknown";

export type PhaseRow = {
  status?: string | null;
  cleaner_response_status?: string | null;
  en_route_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  dispatch_status?: string | null;
  /** When set, `pending_payment` splits into recurring vs one-time operational phase. */
  is_recurring_generated?: boolean | null;
  billing_type?: string | null;
  monthly_invoice_id?: string | null;
};

export type DeriveBookingOperationalPhaseOpts = {
  /** When set with env `CLEANER_LIFECYCLE_DERIVED_COMPLETED_LOG=1` on the server, logs to `system_logs`. */
  telemetryBookingId?: string;
};

function norm(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

/** DB-authoritative: job is completed for UI and business logic. */
export function isAuthoritativeBookingCompleted(row: Pick<PhaseRow, "status" | "completed_at">): boolean {
  if (norm(row.status) === "completed") return true;
  return Boolean(String(row.completed_at ?? "").trim());
}

function maybeLogDerivedCompletedPhase(
  row: PhaseRow,
  opts: DeriveBookingOperationalPhaseOpts | undefined,
  st: string,
  crs: string,
): void {
  if (typeof window !== "undefined") return;
  if (process.env.CLEANER_LIFECYCLE_DERIVED_COMPLETED_LOG !== "1") return;
  const bookingId = opts?.telemetryBookingId?.trim();
  if (!bookingId) return;
  void import("@/lib/logging/systemLog")
    .then(({ logSystemEvent }) =>
      logSystemEvent({
        level: "info",
        source: "derive_booking_operational_phase",
        message: "derived_completed_phase",
        context: {
          booking_id: bookingId,
          status: st,
          cleaner_response_status: crs || null,
          completed_at: row.completed_at ?? null,
        },
      }),
    )
    .catch(() => {});
}

/**
 * Derives operational phase for cleaner/admin UI and drift checks.
 * `cleaner_response_status` is ignored for **completed** until `status` / `completed_at` say so.
 */
export function deriveBookingOperationalPhase(
  row: PhaseRow,
  opts?: DeriveBookingOperationalPhaseOpts,
): BookingOperationalPhase {
  const st = norm(row.status);
  const crs = norm(row.cleaner_response_status);
  const dst = norm(row.dispatch_status);
  const hasEnRouteAt = Boolean(String(row.en_route_at ?? "").trim());

  if (st === "cancelled") return "cancelled";
  if (st === "failed") return "failed";

  if (dst === "expired" && (st === "pending" || st === "offered" || st === "pending_assignment")) {
    return "expired";
  }

  if (isAuthoritativeBookingCompleted(row)) {
    maybeLogDerivedCompletedPhase(row, opts, st, crs);
    return "completed";
  }

  if (st === "pending_payment") {
    if (bookingMatchesRecurringCleanerPendingPayment(row as Record<string, unknown>)) return "pending_payment_recurring";
    return "pending_payment";
  }

  if (st === "pending" || st === "offered" || st === "pending_assignment") return "pending";

  /** Must run after completion checks — never treat `cleaner_response_status` alone as completed. */
  if (st === "in_progress") {
    return "active";
  }

  const assignable = st === "assigned" || st === "confirmed" || st === "offered";

  if (assignable && crs === CLEANER_RESPONSE.STARTED) return "active";
  if (assignable && (crs === CLEANER_RESPONSE.ON_MY_WAY || hasEnRouteAt)) return "travelling";
  if (assignable && (crs === CLEANER_RESPONSE.ACCEPTED || crs === CLEANER_RESPONSE.PENDING || crs === CLEANER_RESPONSE.NONE)) {
    return crs === CLEANER_RESPONSE.ACCEPTED ? "accepted" : "assigned";
  }

  if (assignable) return "assigned";

  if (!st) return "unknown";
  return "unknown";
}
