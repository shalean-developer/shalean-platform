import {
  CLEANER_RESPONSE,
  canonicalDbBookingStatus,
  isAssignableForCleanerLifecycleStatus,
} from "@shalean/types";
import type { CleanerJobWire, CleanerLifecycleAction } from "@/services/types/cleanerJobs";

export type CleanerJobActions = {
  accept: boolean;
  reject: boolean;
  enRoute: boolean;
  start: boolean;
  complete: boolean;
};

const NONE: CleanerJobActions = {
  accept: false,
  reject: false,
  enRoute: false,
  start: false,
  complete: false,
};

/**
 * Derive which lifecycle buttons to show from wire fields + shared status helpers.
 * Intentionally simpler than the full web orchestrator; server remains the authority.
 */
export function deriveCleanerJobActions(job: CleanerJobWire): CleanerJobActions {
  const status = canonicalDbBookingStatus(job.status);
  const raw = String(job.cleaner_response_status ?? "")
    .trim()
    .toLowerCase();
  const isTeam = job.is_team_job === true;
  const enRouteAcked = Boolean(String(job.en_route_at ?? "").trim()) || raw === CLEANER_RESPONSE.ON_MY_WAY;
  const accepted =
    raw === CLEANER_RESPONSE.ACCEPTED ||
    raw === CLEANER_RESPONSE.ON_MY_WAY ||
    raw === CLEANER_RESPONSE.STARTED ||
    raw === CLEANER_RESPONSE.COMPLETED ||
    Boolean(String(job.accepted_at ?? "").trim());

  if (status === "cancelled" || status === "failed" || status === "completed") {
    return NONE;
  }

  if (status === "in_progress" || raw === CLEANER_RESPONSE.STARTED) {
    return { ...NONE, complete: true };
  }

  if (isAssignableForCleanerLifecycleStatus(job.status)) {
    if (enRouteAcked) {
      return { ...NONE, start: true };
    }
    if (accepted) {
      return { ...NONE, enRoute: true };
    }
    return { ...NONE, accept: true, reject: !isTeam };
  }

  return NONE;
}

export function actionLabel(action: CleanerLifecycleAction): string {
  switch (action) {
    case "accept":
      return "Accept job";
    case "reject":
      return "Decline job";
    case "en_route":
      return "On my way";
    case "start":
      return "Start job";
    case "complete":
      return "Complete job";
    default:
      return action;
  }
}

/** Short CTA for list / hero cards. */
export function primaryCardAction(job: CleanerJobWire): {
  kind: "accept" | "navigate";
  label: string;
  action?: CleanerLifecycleAction;
} {
  const actions = deriveCleanerJobActions(job);
  if (actions.accept) return { kind: "accept", label: "Accept", action: "accept" };
  if (actions.enRoute) return { kind: "navigate", label: "On my way", action: "en_route" };
  if (actions.start) return { kind: "navigate", label: "Start", action: "start" };
  if (actions.complete) return { kind: "navigate", label: "Complete", action: "complete" };
  return { kind: "navigate", label: "Open" };
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}
