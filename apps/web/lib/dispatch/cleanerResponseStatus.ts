/** `bookings.cleaner_response_status` — Postgres is source of truth; Realtime notifies cleaners. */
export const CLEANER_RESPONSE = {
  NONE: "none",
  PENDING: "pending",
  ACCEPTED: "accepted",
  DECLINED: "declined",
  TIMEOUT: "timeout",
} as const;

export type CleanerResponseStatus = (typeof CLEANER_RESPONSE)[keyof typeof CLEANER_RESPONSE];
