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
  /** Row is `in_progress` but `cleaner_response_status` is not `started` (data drift guard). */
  COMPLETE_REQUIRES_STARTED_RESPONSE: "lifecycle_complete_requires_started_response",
  UNSUPPORTED: "lifecycle_unsupported",
  /** Assigned offer: scheduled start + grace passed without accept. */
  ACCEPT_OFFER_EXPIRED: "lifecycle_accept_offer_expired",
  /**
   * Conditional accept update matched zero rows (PostgREST returns no error for 0-row updates).
   * Usually status left `assigned` between read and write, or booking was cleared elsewhere.
   */
  ACCEPT_UPDATE_NO_ROW: "lifecycle_accept_update_no_row",
} as const;
