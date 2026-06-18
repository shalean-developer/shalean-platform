import { todayYmdJohannesburg } from "@/lib/booking/dateInJohannesburg";
import { minutesUntilJobStartJohannesburg } from "@/lib/cleaner/cleanerUpcomingScheduleJohannesburg";

/** Booking-level preferred-cleaner dispatch phases (see migration check constraint). */
export const PREFERRED_DISPATCH_STATUSES = [
  "preferred_cleaner_pending",
  "preferred_cleaner_accepted",
  "preferred_cleaner_expired",
  "preferred_cleaner_skipped_urgent",
  "backup_dispatch_started",
  "backup_offer_pending",
  "assigned_to_backup_cleaner",
  "accepted",
  "expired",
] as const;

export type PreferredDispatchStatus = (typeof PREFERRED_DISPATCH_STATUSES)[number];

export type PreferredDispatchContext = "skip_within_2_hours" | "same_day_urgent" | "normal";

const JHB_OFFSET = "+02:00";
const NORMAL_DEADLINE_HOUR = 16;
const AFTER_DEADLINE_MINUTES = 30;
const URGENT_TTL_MINUTES_SOON = 5;
const URGENT_TTL_MINUTES_RELAXED = 20;
/** Job starts within this many minutes → skip preferred wait entirely. */
export const PREFERRED_SKIP_MINUTES = 120;
/** Same-day urgent: use short TTL when job starts within this many minutes. */
const URGENT_SOON_JOB_MINUTES = 180;

export function classifyPreferredDispatchContext(params: {
  dateYmd: string;
  timeHm: string;
  bookingPriority?: string | null;
  now?: Date;
}): PreferredDispatchContext {
  const now = params.now ?? new Date();
  const minutesUntil = minutesUntilJobStartJohannesburg(params.dateYmd, params.timeHm, now);
  if (minutesUntil != null && minutesUntil < PREFERRED_SKIP_MINUTES) {
    return "skip_within_2_hours";
  }

  const today = todayYmdJohannesburg(now);
  const isSameDay = params.dateYmd.trim().slice(0, 10) === today;
  const isAdminUrgent = String(params.bookingPriority ?? "").trim().toLowerCase() === "high";
  if (isSameDay || isAdminUrgent) {
    return "same_day_urgent";
  }
  return "normal";
}

function johannesburgYmdFromInstant(d: Date): string {
  return todayYmdJohannesburg(d);
}

function fourPmJohannesburgIso(ymd: string): number {
  return Date.parse(`${ymd}T${String(NORMAL_DEADLINE_HOUR).padStart(2, "0")}:00:00${JHB_OFFSET}`);
}

/**
 * Preferred-cleaner offer deadline (Africa/Johannesburg rules):
 * - Normal: until 4 PM on offer day; if sent after 4 PM → +30 minutes.
 * - Same-day / admin urgent: 5 min when job starts soon, else 20 min.
 */
export function computePreferredOfferExpiresAt(params: {
  sentAt: Date;
  dateYmd: string;
  timeHm: string;
  bookingPriority?: string | null;
  now?: Date;
}): Date {
  const sentAt = params.sentAt;
  const context = classifyPreferredDispatchContext({
    dateYmd: params.dateYmd,
    timeHm: params.timeHm,
    bookingPriority: params.bookingPriority,
    now: params.now ?? sentAt,
  });

  if (context === "same_day_urgent") {
    const minutesUntil = minutesUntilJobStartJohannesburg(params.dateYmd, params.timeHm, sentAt);
    const ttlMinutes =
      minutesUntil != null && minutesUntil <= URGENT_SOON_JOB_MINUTES
        ? URGENT_TTL_MINUTES_SOON
        : URGENT_TTL_MINUTES_RELAXED;
    return new Date(sentAt.getTime() + ttlMinutes * 60_000);
  }

  const offerDay = johannesburgYmdFromInstant(sentAt);
  const deadlineMs = fourPmJohannesburgIso(offerDay);
  const sentMs = sentAt.getTime();

  if (sentMs >= deadlineMs) {
    return new Date(sentMs + AFTER_DEADLINE_MINUTES * 60_000);
  }
  return new Date(deadlineMs);
}

export function preferredOfferTtlSeconds(sentAt: Date, expiresAt: Date): number {
  const sec = Math.ceil((expiresAt.getTime() - sentAt.getTime()) / 1000);
  return Math.max(60, Math.min(sec, 7 * 24 * 3600));
}

export function isPreferredOfferUrgent(params: {
  dateYmd: string;
  timeHm: string;
  bookingPriority?: string | null;
  expiresAt: Date;
  sentAt: Date;
}): boolean {
  const ctx = classifyPreferredDispatchContext({
    dateYmd: params.dateYmd,
    timeHm: params.timeHm,
    bookingPriority: params.bookingPriority,
    now: params.sentAt,
  });
  if (ctx === "same_day_urgent") return true;
  const ttlMinutes = (params.expiresAt.getTime() - params.sentAt.getTime()) / 60_000;
  return ttlMinutes <= URGENT_TTL_MINUTES_RELAXED + 1;
}

/** Human-readable admin label for `preferred_dispatch_status`. */
export function preferredDispatchStatusAdminLabel(
  status: string | null | undefined,
  options?: { pendingDeadlineIso?: string | null },
): string | null {
  const s = String(status ?? "").trim();
  if (!s) return null;
  switch (s as PreferredDispatchStatus) {
    case "preferred_cleaner_pending": {
      if (options?.pendingDeadlineIso) {
        const d = new Date(options.pendingDeadlineIso);
        if (Number.isFinite(d.getTime())) {
          const time = d.toLocaleString("en-ZA", {
            timeZone: "Africa/Johannesburg",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });
          return `Preferred cleaner pending until ${time}`;
        }
      }
      return "Preferred cleaner pending until 4:00 PM";
    }
    case "preferred_cleaner_expired":
      return "Preferred cleaner expired";
    case "preferred_cleaner_skipped_urgent":
      return PREFERRED_CLEANER_UNAVAILABLE_URGENT_MESSAGE;
    case "backup_dispatch_started":
      return "Backup dispatch started";
    case "backup_offer_pending":
      return "Backup offers pending";
    case "assigned_to_backup_cleaner":
      return "Assigned to backup cleaner";
    case "preferred_cleaner_accepted":
      return "Preferred cleaner accepted";
    case "accepted":
      return "Cleaner accepted";
    case "expired":
      return "All offers expired";
    default:
      return null;
  }
}

export const PREFERRED_CLEANER_UNAVAILABLE_URGENT_MESSAGE =
  "Preferred cleaner unavailable for urgent booking.";

/** Customer booking detail banner when preferred cleaner was skipped (starts within 2 hours). */
export function customerPreferredDispatchNotice(status: string | null | undefined): string | null {
  const s = String(status ?? "").trim();
  if (s === "preferred_cleaner_skipped_urgent") {
    return PREFERRED_CLEANER_UNAVAILABLE_URGENT_MESSAGE;
  }
  return null;
}

export const PREFERRED_CLEANER_CUSTOMER_DISCLAIMER =
  "We'll offer this booking to your preferred cleaner first. If they're unavailable or don't accept in time, we'll assign the best available cleaner to keep your booking on schedule.";
