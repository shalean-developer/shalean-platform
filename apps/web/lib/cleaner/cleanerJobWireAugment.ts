import {
  durationHoursFromBookingSnapshot,
  explicitDurationHoursFromBookingSnapshot,
  mergedBookingNotesFromSnapshot,
} from "@/lib/cleaner/cleanerMobileBookingMap";

/** Extra fields for cleaner job APIs (snapshot-derived; not always DB columns). */
export function augmentCleanerBookingWire(row: Record<string, unknown>): {
  duration_hours: number;
  job_notes: string | null;
  service_name: string | null;
  service_type: string | null;
} {
  const snap = row.booking_snapshot;
  const explicit = explicitDurationHoursFromBookingSnapshot(snap);
  const duration_hours = explicit ?? durationHoursFromBookingSnapshot(snap);
  const rawNotes = mergedBookingNotesFromSnapshot(snap);
  const job_notes = rawNotes && rawNotes.length > 2000 ? `${rawNotes.slice(0, 1997)}…` : rawNotes;
  const service = typeof row.service === "string" ? row.service.trim() : "";
  const slug = typeof row.service_slug === "string" ? row.service_slug.trim() : "";
  return {
    duration_hours,
    job_notes,
    service_name: service || null,
    service_type: slug || null,
  };
}
