import { serviceLabelFromBookingRow } from "@/lib/booking/bookingV2CustomerDisplay";
import {
  durationHoursFromBookingRecord,
  mergedBookingNotesFromSnapshot,
} from "@/lib/cleaner/cleanerMobileBookingMap";
import { resolvePersistedBookingDurationMinutes } from "@/lib/booking/quote/bookingQuotePersistence";
import { durationHoursFromMinutes } from "@/lib/booking/quote/resolveBookingDurationWorkload";

/** Extra fields for cleaner job APIs (snapshot-derived; not always DB columns). */
export function augmentCleanerBookingWire(
  row: Record<string, unknown>,
  viewerCleanerId?: string | null,
): {
  duration_hours: number;
  duration_minutes: number | null;
  job_notes: string | null;
  service_name: string | null;
  service_type: string | null;
  /** True when this cleaner is the payroll lead (`payout_owner_cleaner_id`) for team jobs. */
  is_lead_cleaner: boolean;
} {
  const snap = row.booking_snapshot;
  const duration_minutes = resolvePersistedBookingDurationMinutes(row);
  const duration_hours =
    duration_minutes != null
      ? durationHoursFromMinutes(duration_minutes)
      : durationHoursFromBookingRecord(row);
  const rawNotes = mergedBookingNotesFromSnapshot(snap);
  const job_notes = rawNotes && rawNotes.length > 2000 ? `${rawNotes.slice(0, 1997)}…` : rawNotes;
  const slug = typeof row.service_slug === "string" ? row.service_slug.trim() : "";
  const service_name = serviceLabelFromBookingRow({
    service: typeof row.service === "string" ? row.service : null,
    service_slug: slug || null,
  });
  const leadId = String(row.payout_owner_cleaner_id ?? "").trim();
  const vid = String(viewerCleanerId ?? "").trim();
  const is_lead_cleaner = Boolean(vid && leadId === vid);
  return {
    duration_hours,
    duration_minutes,
    job_notes,
    service_name,
    service_type: slug || null,
    is_lead_cleaner,
  };
}
