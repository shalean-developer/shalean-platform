export type CleanerNotificationKind = "job_offer" | "job_assigned" | "payout_failed" | "system";

export type CleanerInAppNotification = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  /** ISO 8601 string (normalized from number ms when parsing). */
  created_at: string;
  kind?: CleanerNotificationKind;
  /** Optional stable domain key for dedupe when `id` is absent or reused. */
  booking_id?: string;
  /** Public dispatch offer token — deep-links to `/offer/{token}` from in-app notifications. */
  offer_token?: string;
  /** Canonical dedupe key; aligned with `buildNotificationDedupeKey` for BC + persistence. */
  dedupe_key?: string;
};

/** Payload for `addNotification` on the cleaner notifications context (id optional). */
export type CleanerNotificationInput = {
  id?: string;
  title: string;
  body: string;
  /** ISO string or unix ms */
  created_at?: string | number;
  read?: boolean;
  kind?: CleanerNotificationKind;
  booking_id?: string;
  offer_token?: string;
  /** When set, used as the primary dedupe key (e.g. `job_offer_row:{offerId}`). */
  dedupe_key?: string;
};
