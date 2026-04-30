import {
  durationHoursFromBookingSnapshot,
  explicitDurationHoursFromBookingSnapshot,
  mergedBookingNotesFromSnapshot,
} from "@/lib/cleaner/cleanerMobileBookingMap";

/** Extra fields for cleaner job APIs (snapshot-derived; not always DB columns). */
export function augmentCleanerBookingWire(
  row: Record<string, unknown>,
  viewerCleanerId?: string | null,
): {
  duration_hours: number;
  job_notes: string | null;
  service_name: string | null;
  service_type: string | null;
  /** True when this cleaner is the payroll lead (`payout_owner_cleaner_id`) for team jobs. */
  is_lead_cleaner: boolean;
} {
  const snap = row.booking_snapshot;
  const explicit = explicitDurationHoursFromBookingSnapshot(snap);
  const duration_hours = explicit ?? durationHoursFromBookingSnapshot(snap);
  const rawNotes = mergedBookingNotesFromSnapshot(snap);
  const job_notes = rawNotes && rawNotes.length > 2000 ? `${rawNotes.slice(0, 1997)}…` : rawNotes;
  const service = typeof row.service === "string" ? row.service.trim() : "";
  const slug = typeof row.service_slug === "string" ? row.service_slug.trim() : "";
  const leadId = String(row.payout_owner_cleaner_id ?? "").trim();
  const vid = String(viewerCleanerId ?? "").trim();
  const is_lead_cleaner = Boolean(vid && leadId === vid);
  return {
    duration_hours,
    job_notes,
    service_name: service || null,
    service_type: slug || null,
    is_lead_cleaner,
  };
}
