import type { CleanerJobWire } from "../../services/types/cleanerJobs";

export function acceptanceOverdueMessage(job: CleanerJobWire): string | null {
  const response = String(job.cleaner_response_status ?? "").trim().toLowerCase();
  const status = String(job.status ?? "").trim().toLowerCase();
  if (!job.acceptance_overdue_message || job.accepted_at ||
    !["assigned", "confirmed", "offered"].includes(status) ||
    ["accepted", "on_my_way", "started", "completed"].includes(response)) return null;
  return job.acceptance_overdue_message;
}
