import type { DashboardLifecycleAlignmentWire } from "@/lib/booking/bookingLifecycleContract";
import type { BookingOperationalPhase } from "@/lib/booking/deriveBookingOperationalPhase";
import type { AdminBookingsListRow } from "@/lib/admin/adminBookingsListRow";
import { dispatchStateLabel } from "@/lib/admin/adminBookingsListDerived";

const DISPATCH_TERMINAL_SEMANTIC = new Set<string>(["dispatch_terminal", "pending_assignment_dispatch_terminal"]);

function humanizeOperationalPhase(phase: BookingOperationalPhase): string {
  switch (phase) {
    case "pending":
      return "Awaiting dispatch / assignment";
    case "expired":
      return "Dispatch window expired";
    case "assigned":
      return "Assigned — needs cleaner accept";
    case "accepted":
      return "Accepted";
    case "travelling":
      return "En route";
    case "active":
      return "In progress";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "failed":
      return "Failed";
    case "pending_payment":
      return "Awaiting payment";
    case "pending_payment_recurring":
      return "Awaiting recurring payment";
    case "unknown":
      return "Unknown state";
    default:
      return phase;
  }
}

/**
 * Admin list/detail: dispatch exhausted — surface manual assign / retry dispatch (aligned with customer/cleaner semantic phase).
 */
export function adminDispatchNeedsAttention(
  row: Pick<
    AdminBookingsListRow,
    "status" | "dispatch_status" | "cleaner_id" | "is_team_job" | "team_id" | "dashboardLifecycle"
  >,
): boolean {
  const dl = row.dashboardLifecycle;
  if (dl) {
    if (dl.hasEffectiveAssignee) return false;
    return DISPATCH_TERMINAL_SEMANTIC.has(dl.assignmentSemanticPhase);
  }
  const st = (row.status ?? "").toLowerCase();
  const ds = String(row.dispatch_status ?? "").toLowerCase();
  const pendingLike = st === "pending" || st === "pending_assignment" || st === "offered";
  const unassigned =
    !String(row.cleaner_id ?? "").trim() && !(row.is_team_job === true && String(row.team_id ?? "").trim());
  return pendingLike && unassigned && ["failed", "unassignable", "no_cleaner"].includes(ds);
}

/** Same as {@link adminDispatchNeedsAttention} when only the alignment wire is available (e.g. detail GET). */
export function adminDispatchNeedsAttentionFromLifecycle(
  dl: DashboardLifecycleAlignmentWire | null | undefined,
  fallbackRow: Pick<AdminBookingsListRow, "status" | "dispatch_status" | "cleaner_id" | "is_team_job" | "team_id">,
): boolean {
  return adminDispatchNeedsAttention({ ...fallbackRow, dashboardLifecycle: dl ?? undefined });
}

/**
 * Primary operational caption for admin cards — prefers API `dashboardLifecycle`, falls back to legacy dispatch/status labels.
 */
export function adminLifecycleDispatchCaption(row: AdminBookingsListRow): string {
  const dl = row.dashboardLifecycle;
  if (!dl) {
    return dispatchStateLabel(row.dispatch_status, row.status);
  }
  const segments: string[] = [];
  if (dl.paymentNeedsFollowUp) {
    segments.push("Payment follow-up");
  }
  const sem = dl.assignmentSemanticPhase;
  const phase = dl.operationalPhase;

  if (phase === "completed" || sem === "completed_assigned") {
    segments.push("Completed");
  } else if (phase === "cancelled" || sem.startsWith("booking_cancelled")) {
    segments.push("Cancelled");
  } else if (phase === "failed" || sem.startsWith("booking_failed")) {
    segments.push("Failed");
  } else if (!dl.hasEffectiveAssignee && DISPATCH_TERMINAL_SEMANTIC.has(sem)) {
    segments.push("Dispatch exhausted — assign or retry");
  } else if (
    !dl.hasEffectiveAssignee &&
    (sem === "offered" ||
      sem === "pending_assignment_offered" ||
      sem === "searching" ||
      sem === "pending_assignment_searching" ||
      sem === "dispatch_expired_no_pending_offers" ||
      sem === "pending_assignment_offer_expired")
  ) {
    segments.push("Offer / recovery in flight");
  } else if (dl.hasEffectiveAssignee && (phase === "assigned" || phase === "accepted" || sem === "assigned" || sem === "assigned_accepted")) {
    segments.push("Cleaner assigned");
  } else if (phase === "travelling") {
    segments.push("En route");
  } else if (phase === "active") {
    segments.push("In progress");
  } else if (phase === "pending_payment" || phase === "pending_payment_recurring") {
    segments.push(humanizeOperationalPhase(phase));
  } else {
    segments.push(humanizeOperationalPhase(phase));
  }

  const deduped = [...new Set(segments.filter(Boolean))];
  return deduped.length ? deduped.join(" · ") : dispatchStateLabel(row.dispatch_status, row.status);
}

/** Muted single-line diagnostics: raw DB lifecycle fields (still exposed for ops debugging). */
export function adminLifecycleRawDiagnosticLine(row: AdminBookingsListRow): string {
  const st = (row.status ?? "—").trim() || "—";
  const ds = (row.dispatch_status ?? "—").toString().trim().toLowerCase() || "—";
  return `DB: status=${st} · dispatch_status=${ds}`;
}

/** Ops “needs follow-up” queue: payment flag and/or dispatch exhausted without assignee. */
export function adminNeedsFollowUpQueue(row: AdminBookingsListRow): boolean {
  if (Boolean(row.payment_needs_follow_up)) return true;
  const dl = row.dashboardLifecycle;
  if (!dl) return false;
  if (dl.paymentNeedsFollowUp) return true;
  return !dl.hasEffectiveAssignee && DISPATCH_TERMINAL_SEMANTIC.has(dl.assignmentSemanticPhase);
}
