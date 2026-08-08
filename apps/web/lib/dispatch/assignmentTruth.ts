/**
 * Normalizes assignment metadata around the dispatch-offer lifecycle.
 *
 * Lifecycle semantics: `assignmentLifecycleContract.ts` (booking `status` vs `dispatch_status` vs offers).
 * Both checkout-selected-cleaner offers and auto/smart dispatch offers converge on {@link acceptDispatchOffer}.
 */

/**
 * Canonical booking patch when an individual-cleaner offer starts.
 *
 * Important: this patch intentionally preserves `selected_cleaner_id` so customer intent can still
 * be evaluated when an offer is accepted. It clears only assignment *outcome* fields, ensuring the
 * booking cannot remain simultaneously assigned and offered.
 *
 * Team assignment removal is NOT hidden inside this patch. Team jobs must go through the explicit
 * team-management flow before entering an individual-cleaner offer path; the admin solo validator
 * fails closed when a team assignment is present.
 */
export function assignmentTruthPatchForOfferStart(): {
  cleaner_id: null;
  status: "offered";
  dispatch_status: "offered";
  assigned_at: null;
  accepted_at: null;
  assignment_type: null;
  fallback_reason: null;
} {
  return {
    cleaner_id: null,
    status: "offered",
    dispatch_status: "offered",
    assigned_at: null,
    accepted_at: null,
    assignment_type: null,
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
