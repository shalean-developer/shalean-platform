/**
 * Customer in-app notifications. Soft dedupe (e.g. 3-minute window for assigned) plus
 * DB unique index on (user_id, booking_id, type) for lifecycle types — see migration
 * `20260482_user_notifications_idempotency.sql` + `20260483_user_notifications_recent_index_cancel_type.sql`.
 * Future: per-user rate limits / batching if volume grows; optional `idempotency_key` column for multi-step dedupe.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import {
  bookingStartUtcMs,
  formatWhenForCustomerCopy,
  serviceTitleForCopy,
} from "@/lib/notifications/notificationCopy";

export type CustomerNotificationType = "confirmed" | "assigned" | "reminder" | "cancelled" | "system";

const ASSIGNED_DEDUPE_MS = 3 * 60 * 1000;

async function hasRecentAssignedNotification(
  admin: SupabaseClient,
  userId: string,
  bookingId: string,
): Promise<boolean> {
  const since = new Date(Date.now() - ASSIGNED_DEDUPE_MS).toISOString();
  const { data, error } = await admin
    .from("user_notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("booking_id", bookingId)
    .eq("type", "assigned")
    .gte("created_at", since)
    .limit(1);
  if (error) {
    await reportOperationalIssue("warn", "hasRecentAssignedNotification", error.message, { userId, bookingId });
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

async function hasReminderForBooking(admin: SupabaseClient, bookingId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("user_notifications")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("type", "reminder")
    .limit(1);
  if (error) {
    await reportOperationalIssue("warn", "hasReminderForBooking", error.message, { bookingId });
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

/**
 * In-app dashboard notification (`user_notifications`). Inserts via service role — RLS has no insert for anon.
 * Failures are logged only so booking flows are not blocked.
 */
export async function insertCustomerUserNotification(
  admin: SupabaseClient,
  params: {
    userId: string;
    title: string;
    body: string;
    type?: CustomerNotificationType;
    bookingId?: string | null;
  },
): Promise<void> {
  const uid = params.userId.trim();
  if (!uid || !/^[0-9a-f-]{36}$/i.test(uid)) return;
  const type = params.type ?? "system";
  const bid =
    typeof params.bookingId === "string" && /^[0-9a-f-]{36}$/i.test(params.bookingId.trim()) ? params.bookingId.trim() : null;

  const row: Record<string, unknown> = {
    user_id: uid,
    title: params.title.slice(0, 200),
    body: params.body.slice(0, 2000),
    type,
  };
  if (bid) row.booking_id = bid;

  const { error } = await admin.from("user_notifications").insert(row);
  if (error) {
    // Partial unique index user_notifications_idempotency_user_booking_type_key — treat as success.
    if (error.code === "23505") return;
    await reportOperationalIssue("warn", "insertCustomerUserNotification", error.message, {
      userId: uid,
      type,
      bookingId: bid,
    });
  }
}

/** After successful payment + booking row insert (logged-in customer). */
export async function notifyCustomerBookingPlaced(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    userId: string | null | undefined;
    serviceLabel: string | null | undefined;
    dateYmd: string | null | undefined;
    timeHm: string | null | undefined;
  },
): Promise<void> {
  const uid = params.userId?.trim();
  if (!uid) return;
  const svc = serviceTitleForCopy(params.serviceLabel);
  const when = formatWhenForCustomerCopy(params.dateYmd, params.timeHm);
  await insertCustomerUserNotification(admin, {
    userId: uid,
    type: "confirmed",
    title: `Your ${svc} is confirmed`,
    body: `We’ve received your payment. Your visit is scheduled for ${when}. We’ll notify you when a cleaner is assigned.`,
    bookingId: params.bookingId,
  });
}

/** After `cleaner_id` is set and status is assigned (auto-dispatch, offer accept, or admin). */
export async function notifyCustomerCleanerAssigned(admin: SupabaseClient, bookingId: string): Promise<void> {
  const { data: row, error } = await admin
    .from("bookings")
    .select("user_id, date, time, service, cleaner_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (error || !row || typeof row !== "object") return;

  const userId = (row as { user_id?: string | null }).user_id;
  const cleanerId = (row as { cleaner_id?: string | null }).cleaner_id;
  if (!userId || !cleanerId) return;

  if (await hasRecentAssignedNotification(admin, userId, bookingId)) {
    return;
  }

  const when = formatWhenForCustomerCopy(
    (row as { date?: string | null }).date ?? null,
    (row as { time?: string | null }).time ?? null,
  );
  const svc = serviceTitleForCopy(String((row as { service?: string | null }).service ?? ""));

  const { data: c } = await admin.from("cleaners").select("full_name").eq("id", cleanerId).maybeSingle();
  const name =
    c && typeof c === "object" && "full_name" in c
      ? String((c as { full_name?: string | null }).full_name ?? "").trim() || "Your cleaner"
      : "Your cleaner";

  await insertCustomerUserNotification(admin, {
    userId: userId,
    type: "assigned",
    title: `${name} is your cleaner`,
    body: `You’re all set for ${svc} on ${when}. You can open this booking anytime for details.`,
    bookingId,
  });
}

export async function notifyCustomerBookingCancelled(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    userId: string;
    serviceLabel: string | null | undefined;
    dateYmd: string | null | undefined;
    timeHm: string | null | undefined;
  },
): Promise<void> {
  const when = formatWhenForCustomerCopy(params.dateYmd, params.timeHm);
  const svc = serviceTitleForCopy(params.serviceLabel);
  await insertCustomerUserNotification(admin, {
    userId: params.userId,
    type: "cancelled",
    title: `${svc} cancelled`,
    body: `Your booking for ${when} has been cancelled. If you have questions about refunds, contact support.`,
    bookingId: params.bookingId,
  });
}

/** Target lead time before visit; window below is ± this band for cron resilience. */
const REMINDER_LEAD_MS = 2 * 60 * 60 * 1000;
/** ±30 min → fire when visit is ~1h30–2h30 away (missed cron / clock drift). */
const REMINDER_WINDOW_HALF_MS = 30 * 60 * 1000;

/**
 * ~2 hours before visit (wide window for cron drift). One reminder per booking lifetime.
 * Call from cron only; idempotent per booking (DB unique + pre-check).
 */
export async function notifyCustomerBookingReminderSoon(admin: SupabaseClient, bookingId: string): Promise<boolean> {
  const { data: row, error } = await admin
    .from("bookings")
    .select("user_id, date, time, service, status")
    .eq("id", bookingId)
    .maybeSingle();
  if (error || !row || typeof row !== "object") return false;

  const userId = (row as { user_id?: string | null }).user_id;
  const dateYmd = (row as { date?: string | null }).date ?? null;
  const timeHm = (row as { time?: string | null }).time ?? null;
  const status = String((row as { status?: string | null }).status ?? "").toLowerCase();
  if (!userId || !dateYmd || !timeHm) return false;
  if (status === "cancelled") return false;
  if (!["pending", "confirmed", "assigned"].includes(status)) return false;

  const startMs = bookingStartUtcMs(dateYmd, timeHm);
  if (startMs == null) return false;

  const now = Date.now();
  const untilStart = startMs - now;
  const logBandLo = REMINDER_LEAD_MS - REMINDER_WINDOW_HALF_MS - 15 * 60 * 1000;
  const logBandHi = REMINDER_LEAD_MS + REMINDER_WINDOW_HALF_MS + 15 * 60 * 1000;
  if (untilStart >= logBandLo && untilStart <= logBandHi) {
    console.log("reminder-check", {
      bookingId,
      status,
      startTime: startMs,
      now,
      startTimeIso: new Date(startMs).toISOString(),
      nowIso: new Date(now).toISOString(),
      untilStartMs: untilStart,
    });
  }
  if (
    untilStart < REMINDER_LEAD_MS - REMINDER_WINDOW_HALF_MS ||
    untilStart > REMINDER_LEAD_MS + REMINDER_WINDOW_HALF_MS
  ) {
    return false;
  }

  if (await hasReminderForBooking(admin, bookingId)) return false;

  const svc = serviceTitleForCopy(String((row as { service?: string | null }).service ?? ""));
  const when = formatWhenForCustomerCopy(dateYmd, timeHm);
  await insertCustomerUserNotification(admin, {
    userId: userId,
    type: "reminder",
    title: `Reminder: ${svc} soon`,
    body: `Your cleaning is coming up — ${when}. See your booking for address and details.`,
    bookingId,
  });
  return true;
}
