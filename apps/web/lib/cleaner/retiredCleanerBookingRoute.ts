import { retiredApiJson } from "@/lib/http/retiredApiRoute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CleanerLegacyAction = "accept" | "en-route" | "start" | "complete";

const ACTION_TO_JOBS: Record<CleanerLegacyAction, string> = {
  accept: 'POST /api/cleaner/jobs/:id with { "action": "accept" }',
  "en-route": "POST /api/cleaner/jobs/:id/on-the-way",
  start: 'POST /api/cleaner/jobs/:id with { "action": "start" }',
  complete: 'POST /api/cleaner/jobs/:id with { "action": "complete" }',
};

export function retiredCleanerBookingRoute(action: CleanerLegacyAction, bookingId?: string) {
  const jobsPath = bookingId ? `/api/cleaner/jobs/${encodeURIComponent(bookingId)}` : "/api/cleaner/jobs";
  return retiredApiJson({
    message: `Legacy cleaner booking route is retired. Use ${ACTION_TO_JOBS[action]}.`,
    successor: jobsPath,
  });
}
