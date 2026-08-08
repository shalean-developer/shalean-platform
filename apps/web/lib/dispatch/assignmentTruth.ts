/**
 * Normalizes assignment metadata around the dispatch-offer lifecycle.
 *
 * Lifecycle semantics: `assignmentLifecycleContract.ts` (booking `status` vs `dispatch_status` vs offers).
 * Both checkout-selected-cleaner offers and auto/smart dispatch offers converge on {@link acceptDispatchOffer}.
 */

/**
 * Canonical final-assignee predicate for booking operations.
 * A booking is operationally assigned when either an individual cleaner or a team owns it.
 * Customer intent (`selected_cleaner_id`) and team-shape flags (`is_team_job`) are not final assignees.
 */
export function hasBookingAssignee(row: {
  cleaner_id?: string | null;
  team_id?: string | null;
}): boolean {
  if (String(row.cleaner_id ?? "").trim()) return true;
  if (String(row.team_id ?? "").trim()) return true;
  return false;
}

/**
 * Canonical booking patch when an individual-cleaner offer starts.
 *
 * Important: this patch intentionally preserves both `selected_cleaner_id` and `assignment_type`.
 * `selected_cleaner_id` is customer intent, while `assignment_type='user_selected'` is required by
 * the existing rejection/expiry recovery flows until the offer actually resolves. Clearing either
 * one at offer start can make a customer-selected booking skip fallback recovery.
 *
 * The patch clears only concrete assignment outcome fields, ensuring the booking cannot remain
 * simultaneously assigned and offered. Team assignment removal is NOT hidden inside this patch;
 * team jobs must go through the explicit team-management flow before entering an individual-cleaner
 * offer path.
 */
export function assignmentTruthPatchForOfferStart(): {
  cleaner_id: null;
  status: "offered";
  dispatch_status: "offered";
  assigned_at: null;
  accepted_at: null;
  fallback_reason: null;
} {
  return {
    cleaner_id: null,
    status: "offered",
    dispatch_status: "offered",
    assigned_at: null,
    accepted_at: null,
    fallback_reason: null,
  };
}

/**
 * Normalizes assignment metadata when a dispatch offer is accepted (individual cleaner).
 *
 * Contract (minimal):
 * - `cleaner_id` + `status=assigned` + `dispatch_status=assigned` are set by the caller.
 * - If `assignment_type` was never set (legacy / race), infer `user_selected` vs `auto_dispatch` from `selected_cleaner_id`.
 * - If the accepted cleaner matches `selected_cleaner_id`, clear `fallback_reason` (intent honored).
 */
export function assignmentTruthPatchForOfferAccept(input: {
  acceptedCleanerId: string;
  assignmentTypeBefore: string | null | undefined;
  selectedCleanerId: string | null | undefined;
}): { assignment_type?: string; fallback_reason?: null } {
  const accepted = input.acceptedCleanerId.trim().toLowerCase();
  const sel = String(input.selectedCleanerId ?? "").trim().toLowerCase();
  const atRaw =
    input.assignmentTypeBefore != null && String(input.assignmentTypeBefore).trim()
      ? String(input.assignmentTypeBefore).trim()
      : "";

  const patch: { assignment_type?: string; fallback_reason?: null } = {};

  if (!atRaw) {
    patch.assignment_type = sel && sel === accepted ? "user_selected" : "auto_dispatch";
  }

  if (sel && sel === accepted) {
    patch.fallback_reason = null;
  }

  return patch;
}
