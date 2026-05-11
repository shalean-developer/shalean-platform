/**
 * Normalizes assignment metadata when a dispatch offer is accepted (individual cleaner).
 *
 * Lifecycle semantics: `assignmentLifecycleContract.ts` (booking `status` vs `dispatch_status` vs offers).
 * Both checkout-selected-cleaner offers and auto/smart dispatch offers converge on {@link acceptDispatchOffer}.
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
