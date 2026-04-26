/** Machine-stable codes from `add_team_members_guarded` and admin members API. */
export const TEAM_MEMBER_ADD_CODE = {
  TEAM_BUSY: "TEAM_BUSY",
  EXCEEDS_CAPACITY: "EXCEEDS_CAPACITY",
  TEAM_INACTIVE: "TEAM_INACTIVE",
  TOO_MANY_IDS: "TOO_MANY_IDS",
  VERIFY_FAILED: "VERIFY_FAILED",
  TEAM_NOT_FOUND: "TEAM_NOT_FOUND",
} as const;

export type TeamMemberAddErrorCode = (typeof TEAM_MEMBER_ADD_CODE)[keyof typeof TEAM_MEMBER_ADD_CODE];
