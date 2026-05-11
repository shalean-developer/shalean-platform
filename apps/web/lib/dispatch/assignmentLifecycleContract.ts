/**
 * ## Assignment lifecycle — authoritative fields / semantics
 *
 * **Two axes must be read together:**
 * - `bookings.status` — customer/job lifecycle (`pending`, `pending_assignment`, `offered`, `assigned`, …).
 * - `bookings.dispatch_status` — dispatch funnel (`searching`, `offered`, `assigned`, `accepted`, `expired`, terminal failures, …).
 *
 * **`dispatch_offers`** (per cleaner, per wave): `status` ∈ `pending` | `accepted` | `rejected` | `expired`;
 * response timestamps are stored as `responded_at` (there is no separate `accepted_at` / `rejected_at` column).
 * Offer visibility TTL is `expires_at`.
 *
 * ---
 * ### Semantic map (dashboard-oriented names → meaning)
 *
 * | Semantic label | Where it lives | Meaning |
 * |----------------|----------------|---------|
 * | **pending_assignment** | `bookings.status` | Paid user-selected path; waiting for an offer outcome or recovery dispatch. |
 * | **offered** | `dispatch_offers.status=pending` and/or `bookings.dispatch_status=offered` | At least one live offer exists **or** booking dispatch flag says offers are active. |
 * | **searching** | `bookings.dispatch_status=searching` | Smart dispatch is selecting candidates / opening a wave (no final assignee yet). |
 * | **assigned** | `cleaner_id` **or** (`is_team_job` ∧ `team_id`) | Job has a concrete assignee (individual or team). |
 * | **rejected** | `dispatch_offers.status=rejected` | That cleaner declined; booking may still be dispatchable. |
 * | **expired** | `dispatch_offers.status=expired` **or** `bookings.dispatch_status=expired` | Offer TTL passed **or** booking-level “no pending offers” sync ({@link syncBookingDispatchExpiredWhenNoPendingOffers}). |
 * | **failed** | `dispatch_offers` n/a at booking level | `dispatch_status` ∈ `failed` \| `no_cleaner` \| `unassignable` — dispatch exhausted or blocked. |
 * | **fallback_started** | `assignment_type` / `fallback_reason` | Checkout cleaner was not finalized; recovery/auto pool engaged (`auto_fallback`, reasons like cleaner rejected offer). Not a `dispatch_status` enum value today. |
 * | **auto_assigned** | `assignment_type` | `auto_dispatch` / `auto_fallback` after successful assign — analytics label, not `dispatch_status`. |
 * | **team_assigned** | `is_team_job` + `team_id` | Team roster assignment; RPC also sets lead `cleaner_id` when applicable. |
 *
 * **`dispatch_status=accepted`** — assigned cleaner acknowledged via messaging (`accepted` is post-assignment acknowledgment, not “offer pending”).
 *
 * ---
 * ### Ambiguous / overloaded today
 *
 * - **`bookings.status=offered`** vs **`dispatch_status=offered`** — both appear in recovery/redispatch; prefer treating **pending `dispatch_offers`** as ground truth for “live offer”.
 * - **`dispatch_status=expired`** at booking level vs **`dispatch_offers.status=expired`** — booking flag means “no pending offers left”; offer rows retain per-cleaner outcome.
 * - **`dispatch_status=unassigned`** — legacy / manual clarity bucket; overlap with “no cleaner yet” states.
 * - **`fallback_started`** — conveyed via `fallback_reason` / `assignment_type`, not a dedicated dispatch enum.
 *
 * Dashboard APIs attach the viewer-independent bundle {@link import("@/lib/booking/bookingLifecycleContract").DashboardLifecycleAlignmentWire}
 * (`buildDashboardLifecycleAlignmentWire`) so customer/cleaner/admin share `operationalPhase` + assignment semantics.
 *
 * @module assignmentLifecycleContract
 */

/** Matches latest `bookings_dispatch_status_check` (allows null). */
export const BOOKING_DISPATCH_STATUSES = [
  "searching",
  "offered",
  "assigned",
  "failed",
  "no_cleaner",
  "unassignable",
  "unassigned",
  "accepted",
  "expired",
] as const;

export type BookingDispatchStatus = (typeof BOOKING_DISPATCH_STATUSES)[number];

export const DISPATCH_OFFER_STATUSES = ["pending", "accepted", "rejected", "expired"] as const;

export type DispatchOfferStatus = (typeof DISPATCH_OFFER_STATUSES)[number];

export type BookingAssignmentAuditRow = {
  status?: string | null;
  dispatch_status?: string | null;
  cleaner_id?: string | null;
  team_id?: string | null;
  is_team_job?: boolean | null;
  assignment_type?: string | null;
  fallback_reason?: string | null;
  payment_needs_follow_up?: boolean | null;
  payout_owner_cleaner_id?: string | null;
  selected_cleaner_id?: string | null;
};

export type AssignmentConsistencyContext = {
  /** Exact count of `dispatch_offers` rows with `status=pending` for this booking (optional drift checks). */
  pendingDispatchOfferCount?: number;
};

export type AssignmentConsistencySeverity = "error" | "warn" | "info";

export type AssignmentConsistencyIssue = {
  code: string;
  severity: AssignmentConsistencySeverity;
  detail: string;
};

const DISPATCH_POST_ASSIGN = new Set<string>(["assigned", "accepted"]);
const DISPATCH_FUNNEL_ACTIVE = new Set<string>(["searching", "offered"]);
const BOOKING_PRE_ASSIGN = new Set<string>(["pending", "pending_assignment", "offered"]);

function norm(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

function terminalBookingNonAssign(st: string): boolean {
  return (
    st === "cancelled" ||
    st === "failed" ||
    st === "payment_expired" ||
    st === "pending_payment" ||
    st === "refunded"
  );
}

/** Individual cleaner id or team roster id counts as “has assignee”. */
export function bookingHasEffectiveAssignee(row: Pick<BookingAssignmentAuditRow, "cleaner_id" | "team_id" | "is_team_job">): boolean {
  const cid = String(row.cleaner_id ?? "").trim();
  if (cid) return true;
  return row.is_team_job === true && Boolean(String(row.team_id ?? "").trim());
}

/**
 * Derives a single coarse semantic phase for future dashboards (non-authoritative; use raw columns for writes).
 */
export function deriveAssignmentSemanticPhase(
  row: BookingAssignmentAuditRow,
  ctx?: AssignmentConsistencyContext,
): string {
  const st = norm(row.status);
  const ds = norm(row.dispatch_status);
  const pendingOffers = ctx?.pendingDispatchOfferCount;

  if (terminalBookingNonAssign(st)) return `booking_${st || "unknown"}`;
  if (bookingHasEffectiveAssignee(row) && (st === "assigned" || st === "in_progress")) {
    if (ds === "accepted") return "assigned_accepted";
    return "assigned";
  }
  if (bookingHasEffectiveAssignee(row) && st === "completed") return "completed_assigned";

  if (st === "pending_assignment") {
    if (typeof pendingOffers === "number" && pendingOffers > 0) return "pending_assignment_offered";
    if (ds === "searching") return "pending_assignment_searching";
    if (ds === "expired") return "pending_assignment_offer_expired";
    if (ds === "failed" || ds === "no_cleaner" || ds === "unassignable") return "pending_assignment_dispatch_terminal";
    return "pending_assignment";
  }

  if (ds === "searching") return "searching";
  if (ds === "offered" || (typeof pendingOffers === "number" && pendingOffers > 0)) return "offered";
  if (ds === "expired") return "dispatch_expired_no_pending_offers";
  if (ds === "failed" || ds === "no_cleaner" || ds === "unassignable") return "dispatch_terminal";

  return "unknown_or_legacy";
}

/**
 * Detects inconsistent combinations between booking lifecycle, dispatch flags, and assignee columns.
 * Pure function — safe to call from diagnostics, tests, or after assignment writes.
 */
export function listBookingAssignmentConsistencyIssues(
  row: BookingAssignmentAuditRow,
  ctx?: AssignmentConsistencyContext,
): AssignmentConsistencyIssue[] {
  const issues: AssignmentConsistencyIssue[] = [];
  const st = norm(row.status);
  const ds = norm(row.dispatch_status);
  const hasAssignee = bookingHasEffectiveAssignee(row);
  const fallbackReason = String(row.fallback_reason ?? "").trim();
  const payFollowUp = row.payment_needs_follow_up === true;

  if (!terminalBookingNonAssign(st)) {
    if ((st === "assigned" || st === "in_progress" || st === "completed") && !hasAssignee) {
      issues.push({
        code: "ACTIVE_OR_DONE_WITHOUT_ASSIGNEE",
        severity: "error",
        detail: `status=${st} but neither cleaner_id nor team assignment is present.`,
      });
    }
  }

  if (DISPATCH_POST_ASSIGN.has(ds) && BOOKING_PRE_ASSIGN.has(st)) {
    issues.push({
      code: "DISPATCH_POST_ASSIGN_BOOKING_STILL_PRE_ASSIGN",
      severity: "error",
      detail: `dispatch_status=${ds} but bookings.status=${st} (expected assigned/in_progress/completed).`,
    });
  }

  const cid = String(row.cleaner_id ?? "").trim();
  if (cid && DISPATCH_FUNNEL_ACTIVE.has(ds)) {
    issues.push({
      code: "CLEANER_ID_WITH_ACTIVE_DISPATCH_FUNNEL",
      severity: "error",
      detail: `cleaner_id is set while dispatch_status=${ds} (funnel implies no assignee yet).`,
    });
  }

  const pendingCount = ctx?.pendingDispatchOfferCount;
  if (typeof pendingCount === "number" && st === "pending_assignment" && ds === "offered" && pendingCount === 0) {
    issues.push({
      code: "DISPATCH_OFFERED_FLAG_WITHOUT_PENDING_OFFER_ROWS",
      severity: "warn",
      detail: "dispatch_status=offered but pendingDispatchOfferCount=0 — possible sync drift.",
    });
  }

  if (
    st === "pending_assignment" &&
    ds === "expired" &&
    !fallbackReason &&
    !payFollowUp &&
    typeof pendingCount === "number" &&
    pendingCount === 0
  ) {
    issues.push({
      code: "PENDING_ASSIGNMENT_EXPIRED_WITHOUT_FALLBACK_SIGNAL",
      severity: "info",
      detail:
        "pending_assignment with dispatch expired, no fallback_reason and no payment_needs_follow_up — confirm recovery cron or admin queue.",
    });
  }

  return issues;
}

export function bookingAssignmentConsistencyWorstSeverity(
  issues: AssignmentConsistencyIssue[],
): AssignmentConsistencySeverity | null {
  if (issues.some((i) => i.severity === "error")) return "error";
  if (issues.some((i) => i.severity === "warn")) return "warn";
  if (issues.length) return "info";
  return null;
}
