import type { CleanerMobilePhase } from "@/lib/cleaner/cleanerMobileBookingMap";

/** Current cleaner only — team-wide roster state needs server fields later. */
export function teamSelfAvailabilityChip(
  phase: CleanerMobilePhase,
  ackedLocally: boolean,
): { label: string; variant: "confirmed" | "pending" | "on_job" } {
  if (phase === "en_route" || phase === "in_progress" || phase === "completed") {
    return { label: "In progress", variant: "on_job" };
  }
  if (ackedLocally) {
    return { label: "Availability confirmed", variant: "confirmed" };
  }
  return { label: "Not confirmed yet", variant: "pending" };
}
