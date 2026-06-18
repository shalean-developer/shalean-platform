/** Job detail route inside the ui-redesign cleaner workspace (`/jobs/job/[id]`). */
export function cleanerJobDetailHref(bookingId: string): string {
  const id = String(bookingId ?? "").trim();
  if (!id) return "/jobs/list";
  return `/jobs/job/${encodeURIComponent(id)}`;
}

/** Legacy cleaner job detail path — keep for magic links, emails, and pre-cutover bookmarks. */
export function legacyCleanerJobDetailHref(bookingId: string): string {
  const id = String(bookingId ?? "").trim();
  if (!id) return "/cleaner/jobs";
  return `/cleaner/jobs/${encodeURIComponent(id)}`;
}
