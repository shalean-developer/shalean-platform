import { deriveBookingOperationalPhase, type PhaseRow } from "@/lib/booking/deriveBookingOperationalPhase";
import { logSystemEvent } from "@/lib/logging/systemLog";

/** Minimal booking row for admin list date/phase segmentation (matches API list select). */
export type AdminBookingListClassifyRow = Pick<
  PhaseRow,
  | "status"
  | "cleaner_response_status"
  | "en_route_at"
  | "started_at"
  | "completed_at"
  | "dispatch_status"
  | "is_recurring_generated"
  | "billing_type"
  | "monthly_invoice_id"
> & {
  date: string | null;
  /** When set, enables optional `CANONICAL_OPERATIONAL_MISMATCH_LOG` diagnostics. */
  id?: string;
};

function phaseRowFromListRow(row: AdminBookingListClassifyRow): PhaseRow {
  return {
    status: row.status,
    cleaner_response_status: row.cleaner_response_status,
    en_route_at: row.en_route_at,
    started_at: row.started_at,
    completed_at: row.completed_at,
    dispatch_status: row.dispatch_status,
    is_recurring_generated: row.is_recurring_generated,
    billing_type: row.billing_type,
    monthly_invoice_id: row.monthly_invoice_id,
  };
}

/**
 * Segments admin bookings list into Today / Upcoming / Completed tabs.
 * Uses {@link deriveBookingOperationalPhase} — matches {@link buildDashboardLifecycleAlignmentWire}.operationalPhase
 * on list payloads that include `dashboardLifecycle`.
 */
export function classifyAdminBookingListRow(
  row: AdminBookingListClassifyRow,
  todayYmd: string,
): "today" | "upcoming" | "completed" {
  const st = String(row.status ?? "").trim().toLowerCase();
  if (st === "payment_expired") {
    return finalizeAdminListBucket(row, todayYmd, "completed");
  }

  const phase = deriveBookingOperationalPhase(phaseRowFromListRow(row));
  if (phase === "completed" || phase === "cancelled" || phase === "failed") {
    return finalizeAdminListBucket(row, todayYmd, "completed");
  }

  const d = row.date && /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? row.date : null;
  if (!d) return finalizeAdminListBucket(row, todayYmd, "upcoming");
  if (d === todayYmd) return finalizeAdminListBucket(row, todayYmd, "today");
  if (d > todayYmd) return finalizeAdminListBucket(row, todayYmd, "upcoming");
  return finalizeAdminListBucket(row, todayYmd, "completed");
}

function legacyClassifyAdminBookingListRow(
  row: AdminBookingListClassifyRow,
  todayYmd: string,
): "today" | "upcoming" | "completed" {
  const st = row.status?.toLowerCase();
  if (st === "completed" || st === "cancelled" || st === "failed" || st === "payment_expired") return "completed";
  const d = row.date && /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? row.date : null;
  if (!d) return "upcoming";
  if (d === todayYmd) return "today";
  if (d > todayYmd) return "upcoming";
  return "completed";
}

function finalizeAdminListBucket(
  row: AdminBookingListClassifyRow,
  todayYmd: string,
  bucket: "today" | "upcoming" | "completed",
): "today" | "upcoming" | "completed" {
  if (process.env.CANONICAL_OPERATIONAL_MISMATCH_LOG === "1" && row.id) {
    const legacy = legacyClassifyAdminBookingListRow(row, todayYmd);
    if (legacy !== bucket) {
      void logSystemEvent({
        level: "info",
        source: "admin_booking_list_classify",
        message: "canonical_operational_mismatch",
        context: {
          booking_id: row.id,
          legacy_bucket: legacy,
          operational_bucket: bucket,
          status: row.status ?? null,
          completed_at: row.completed_at ?? null,
        },
      });
    }
  }
  return bucket;
}
