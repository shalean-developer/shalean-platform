type AssignmentAcceptanceWire = {
  acceptance_overdue_message?: string | null;
  cleaner_response_status?: string | null;
  status?: string | null;
  accepted_at?: string | null;
};

/** Keep cached warnings from surviving acceptance or a terminal booking state. */
export function acceptanceOverdueMessage(job: AssignmentAcceptanceWire): string | null {
  const response = String(job.cleaner_response_status ?? "").trim().toLowerCase();
  const status = String(job.status ?? "").trim().toLowerCase();
  if (!job.acceptance_overdue_message || job.accepted_at ||
    !["assigned", "confirmed", "offered"].includes(status) ||
    ["accepted", "on_my_way", "started", "completed"].includes(response)) return null;
  return job.acceptance_overdue_message;
}
