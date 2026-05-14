export const ADMIN_BOOKING_PATCH_ASSIGNMENT_BLOCK_CODE = "admin_booking_patch_assignment_fields_blocked";

export const ADMIN_BOOKING_PATCH_ASSIGNMENT_FIELDS = [
  "cleaner_id",
  "selected_cleaner_id",
  "payout_owner_cleaner_id",
  "assignment_type",
  "assigned_at",
  "accepted_at",
] as const;

export type AdminBookingPatchAssignmentField = (typeof ADMIN_BOOKING_PATCH_ASSIGNMENT_FIELDS)[number];

export type AdminBookingPatchAssignmentGuardResult =
  | { ok: true }
  | {
      ok: false;
      code: typeof ADMIN_BOOKING_PATCH_ASSIGNMENT_BLOCK_CODE;
      message: string;
      blockedFields: AdminBookingPatchAssignmentField[];
    };

export function assertAdminBookingPatchDoesNotMutateAssignmentFields(
  body: Record<string, unknown>,
): AdminBookingPatchAssignmentGuardResult {
  const blockedFields = ADMIN_BOOKING_PATCH_ASSIGNMENT_FIELDS.filter((field) =>
    Object.prototype.hasOwnProperty.call(body, field),
  );

  if (blockedFields.length === 0) return { ok: true };

  return {
    ok: false,
    code: ADMIN_BOOKING_PATCH_ASSIGNMENT_BLOCK_CODE,
    message: "Assignment fields must be changed through the admin assignment flow, not generic booking PATCH.",
    blockedFields,
  };
}
