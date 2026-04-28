/** Stable codes for cleaner job lifecycle 4xx responses (UI may branch on `code`). */
export const CLEANER_LIFECYCLE_CODE = {
  NOT_ASSIGNED: "lifecycle_not_assigned",
  NOT_ASSIGNED_FOR_REJECT: "lifecycle_not_assigned_for_reject",
  TEAM_REJECT_FORBIDDEN: "lifecycle_team_reject_forbidden",
  INVALID_EN_ROUTE_STATE: "lifecycle_invalid_en_route_state",
  ACCEPT_REQUIRED_BEFORE_TRAVEL: "lifecycle_accept_required_before_travel",
  START_REQUIRES_ASSIGNED: "lifecycle_start_requires_assigned",
  EN_ROUTE_REQUIRED_BEFORE_START: "lifecycle_en_route_required_before_start",
  COMPLETE_REQUIRES_IN_PROGRESS: "lifecycle_complete_requires_in_progress",
  UNSUPPORTED: "lifecycle_unsupported",
} as const;
