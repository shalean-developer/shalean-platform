/** `bookings.cleaner_response_status` — Postgres is source of truth; Realtime notifies cleaners. */
export const CLEANER_RESPONSE = {
  NONE: "none",
  PENDING: "pending",
  ACCEPTED: "accepted",
  /** Cleaner tapped “On my way” (travel started). */
  ON_MY_WAY: "on_my_way",
  /** Job marked started (`bookings.status` becomes `in_progress`). */
  STARTED: "started",
  DECLINED: "declined",
  TIMEOUT: "timeout",
} as const;

export type CleanerResponseStatus = (typeof CLEANER_RESPONSE)[keyof typeof CLEANER_RESPONSE];
