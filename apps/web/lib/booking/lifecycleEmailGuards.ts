import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { LIFECYCLE_SKIP } from "@/lib/booking/lifecycleEmailSkipReasons";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { logSystemEvent } from "@/lib/logging/systemLog";
import {
  bookingPaidCustomerSignalsPresent,
} from "@/lib/payout/adminBookingAssignmentEarningsGate";
import type { BookingPaidSignalRow } from "@/lib/payout/bookingEarningsIntegrity";
import { evaluateCustomerReviewPromptEligibility } from "@/lib/reviews/customerReviewFollowUpContract";

export type LifecycleJobType = "reminder_24h" | "review_request" | "rebook_offer" | "rebook_reminder";

const DAY_MS = 24 * 60 * 60 * 1000;

const REBOOK_JOB_TYPES: LifecycleJobType[] = ["rebook_offer", "rebook_reminder"];

const FUTURE_BOOKING_STATUSES = new Set([
  "pending",
  "pending_assignment",
  "assigned",
  "in_progress",
]);

const UNPAID_BOOKING_STATUSES = new Set(["pending_payment", "payment_expired", "failed"]);

const TERMINAL_BOOKING_STATUSES = new Set(["cancelled", "failed", "payment_expired"]);

export function isRebookLifecycleJobType(jobType: string): boolean {
  return jobType === "rebook_offer" || jobType === "rebook_reminder";
}

export function computeAppointmentStartIso(booking: {
  booking_snapshot?: BookingSnapshotV1 | null;
  date?: string | null;
}): string | null {
  const snap = booking.booking_snapshot as BookingSnapshotV1 | null | undefined;
  const locked = snap?.locked;
  let dateYmd = locked?.date?.trim() ?? "";
  if (!dateYmd && typeof booking.date === "string") {
    dateYmd = booking.date.trim();
  }
  if (!dateYmd || !/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) return null;

  let timeHm = locked?.time?.trim() ?? "";
  if (!/^\d{1,2}:\d{2}$/.test(timeHm)) timeHm = "09:00";
  const [hh, mm] = timeHm.split(":").map((x) => parseInt(x, 10));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;

  const wall = `${dateYmd}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+02:00`;
  const startMs = Date.parse(wall);
  if (!Number.isFinite(startMs)) return null;
  return new Date(startMs).toISOString();
}

export function isBookingCancelledForLifecycle(booking: { status?: string | null }): boolean {
  return String(booking.status ?? "").trim().toLowerCase() === "cancelled";
}

export function isBookingUnpaidForLifecycle(booking: Record<string, unknown>): boolean {
  const st = String(booking.status ?? "").trim().toLowerCase();
  if (UNPAID_BOOKING_STATUSES.has(st)) return true;
  const ps = String(booking.payment_status ?? "").trim().toLowerCase();
  if (ps === "failed" || ps === "pending") return true;
  if (ps === "success" || ps === "pending_monthly") return false;
  return !bookingPaidCustomerSignalsPresent(booking as BookingPaidSignalRow);
}

export function isBookingPaidForLifecycle(booking: Record<string, unknown>): boolean {
  return !isBookingUnpaidForLifecycle(booking);
}

export function bookingSnapshotHasRecurringPlan(booking: {
  booking_snapshot?: BookingSnapshotV1 | null;
}): boolean {
  const freq = booking.booking_snapshot?.subscription?.frequency;
  return freq === "weekly" || freq === "biweekly" || freq === "monthly";
}

export type StaleCheckResult = { stale: true; reason: string } | { stale: false };

export function evaluateStaleJob(params: {
  jobType: string;
  appointmentStartIso: string | null;
  nowMs?: number;
}): StaleCheckResult {
  const nowMs = params.nowMs ?? Date.now();
  const startMs = params.appointmentStartIso ? Date.parse(params.appointmentStartIso) : NaN;
  if (!Number.isFinite(startMs)) return { stale: false };

  switch (params.jobType as LifecycleJobType) {
    case "reminder_24h":
      if (startMs < nowMs) {
        return { stale: true, reason: LIFECYCLE_SKIP.appointmentAlreadyPassed };
      }
      break;
    case "review_request":
      if (startMs + 7 * DAY_MS < nowMs) {
        return { stale: true, reason: LIFECYCLE_SKIP.reviewRequestTooOld };
      }
      break;
    case "rebook_offer":
      if (startMs + 7 * DAY_MS < nowMs) {
        return { stale: true, reason: LIFECYCLE_SKIP.rebookOfferTooOld };
      }
      break;
    case "rebook_reminder":
      if (startMs + 30 * DAY_MS < nowMs) {
        return { stale: true, reason: LIFECYCLE_SKIP.rebookOfferTooOld };
      }
      break;
    default:
      break;
  }
  return { stale: false };
}

export type RebookEligibilityResult = { eligible: true } | { eligible: false; reason: string };

export async function customerHasActiveRecurringPlan(params: {
  supabase: SupabaseClient;
  userId: string | null;
  recurringId?: string | null;
  isRecurringGenerated?: boolean | null;
  bookingSnapshot?: BookingSnapshotV1 | null;
}): Promise<boolean> {
  if (params.recurringId) return true;
  if (params.isRecurringGenerated === true) return true;
  if (params.bookingSnapshot && bookingSnapshotHasRecurringPlan({ booking_snapshot: params.bookingSnapshot })) {
    return true;
  }
  if (!params.userId) return false;

  const { count, error } = await params.supabase
    .from("recurring_bookings")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", params.userId)
    .in("status", ["active", "paused"]);

  if (error) return false;
  return (count ?? 0) > 0;
}

function bookingRowIsFuturePaidCandidate(
  row: Record<string, unknown>,
  excludeBookingId: string,
  nowMs: number,
): boolean {
  const id = String(row.id ?? "");
  if (!id || id === excludeBookingId) return false;

  const st = String(row.status ?? "").trim().toLowerCase();
  if (!FUTURE_BOOKING_STATUSES.has(st)) return false;
  if (TERMINAL_BOOKING_STATUSES.has(st)) return false;

  const ps = String(row.payment_status ?? "").trim().toLowerCase();
  const paid = ps === "success" || ps === "pending_monthly" || bookingPaidCustomerSignalsPresent(row as BookingPaidSignalRow);
  if (!paid) return false;

  const startIso = computeAppointmentStartIso(row as { booking_snapshot?: BookingSnapshotV1 | null; date?: string | null });
  if (!startIso) return false;
  return Date.parse(startIso) > nowMs;
}

/** Another paid/confirmed booking for the same customer with appointment start in the future. */
export async function customerHasFuturePaidBooking(params: {
  supabase: SupabaseClient;
  userId: string | null;
  customerEmail: string;
  excludeBookingId: string;
  nowMs?: number;
}): Promise<boolean> {
  const nowMs = params.nowMs ?? Date.now();
  let normalizedEmail = "";
  try {
    normalizedEmail = params.customerEmail ? normalizeEmail(params.customerEmail) : "";
  } catch {
    normalizedEmail = "";
  }

  const select =
    "id, status, payment_status, date, booking_snapshot, amount_paid_cents, total_paid_cents, total_paid_zar";

  if (params.userId) {
    const { data, error } = await params.supabase
      .from("bookings")
      .select(select)
      .eq("user_id", params.userId)
      .neq("id", params.excludeBookingId)
      .in("status", [...FUTURE_BOOKING_STATUSES])
      .limit(25);

    if (error) return false;
    return (data ?? []).some((row) => bookingRowIsFuturePaidCandidate(row as Record<string, unknown>, params.excludeBookingId, nowMs));
  }

  if (!normalizedEmail) return false;

  const { data, error } = await params.supabase
    .from("bookings")
    .select(select)
    .eq("customer_email", normalizedEmail)
    .neq("id", params.excludeBookingId)
    .in("status", [...FUTURE_BOOKING_STATUSES])
    .limit(25);

  if (error) return false;
  return (data ?? []).some((row) => bookingRowIsFuturePaidCandidate(row as Record<string, unknown>, params.excludeBookingId, nowMs));
}

export async function customerUnsubscribedFromMarketing(params: {
  supabase: SupabaseClient;
  userId: string | null;
}): Promise<boolean> {
  if (!params.userId) return false;

  const { data, error } = await params.supabase
    .from("user_profiles")
    .select("marketing_emails_unsubscribed_at")
    .eq("id", params.userId)
    .maybeSingle();

  if (error || !data) return false;
  return data.marketing_emails_unsubscribed_at != null;
}

/** Rebook nudges: once-off customers only — no recurring plan, no future booking, not unsubscribed. */
export async function evaluateRebookEligibility(params: {
  supabase: SupabaseClient;
  userId: string | null;
  customerEmail: string;
  excludeBookingId: string;
  recurringId?: string | null;
  isRecurringGenerated?: boolean | null;
  bookingSnapshot?: BookingSnapshotV1 | null;
  nowMs?: number;
}): Promise<RebookEligibilityResult> {
  const hasRecurring = await customerHasActiveRecurringPlan({
    supabase: params.supabase,
    userId: params.userId,
    recurringId: params.recurringId,
    isRecurringGenerated: params.isRecurringGenerated,
    bookingSnapshot: params.bookingSnapshot,
  });
  if (hasRecurring) {
    return { eligible: false, reason: LIFECYCLE_SKIP.customerHasActiveRecurringPlan };
  }

  const hasFuture = await customerHasFuturePaidBooking({
    supabase: params.supabase,
    userId: params.userId,
    customerEmail: params.customerEmail,
    excludeBookingId: params.excludeBookingId,
    nowMs: params.nowMs,
  });
  if (hasFuture) {
    return { eligible: false, reason: LIFECYCLE_SKIP.customerHasFutureBooking };
  }

  const unsubscribed = await customerUnsubscribedFromMarketing({
    supabase: params.supabase,
    userId: params.userId,
  });
  if (unsubscribed) {
    return { eligible: false, reason: LIFECYCLE_SKIP.customerUnsubscribed };
  }

  return { eligible: true };
}

/** @deprecated Use evaluateRebookEligibility — kept for gradual migration in tests. */
export async function evaluateRebookSkipForCustomer(params: {
  supabase: SupabaseClient;
  userId: string | null;
  recurringId?: string | null;
  isRecurringGenerated?: boolean | null;
}): Promise<{ skip: true; reason: string } | { skip: false }> {
  const result = await evaluateRebookEligibility({
    supabase: params.supabase,
    userId: params.userId,
    customerEmail: "",
    excludeBookingId: "",
    recurringId: params.recurringId,
    isRecurringGenerated: params.isRecurringGenerated,
  });
  if (!result.eligible) return { skip: true, reason: result.reason };
  return { skip: false };
}

export type ReviewLifecycleResult = { allowed: true } | { allowed: false; reason: string };

export function evaluateReviewRequestLifecycleEligibility(
  booking: Record<string, unknown>,
  params?: { appointmentStartIso?: string | null; nowMs?: number },
): ReviewLifecycleResult {
  const nowMs = params?.nowMs ?? Date.now();
  const startIso = params?.appointmentStartIso ?? computeAppointmentStartIso(booking as { booking_snapshot?: BookingSnapshotV1 | null; date?: string | null });
  if (startIso) {
    const startMs = Date.parse(startIso);
    if (Number.isFinite(startMs) && startMs + 7 * DAY_MS < nowMs) {
      return { allowed: false, reason: LIFECYCLE_SKIP.reviewRequestTooOld };
    }
  }

  const rev = evaluateCustomerReviewPromptEligibility(booking);
  if (rev.allowed) return { allowed: true };

  switch (rev.skipReason) {
    case "review_prompt_unpaid_checkout":
      return { allowed: false, reason: LIFECYCLE_SKIP.bookingUnpaid };
    case "review_prompt_booking_not_completed":
      return { allowed: false, reason: LIFECYCLE_SKIP.bookingNotCompleted };
    case "review_prompt_no_assignee":
      return { allowed: false, reason: LIFECYCLE_SKIP.noCleanerOrTeamAssigned };
    case "review_prompt_terminal_booking":
      return { allowed: false, reason: LIFECYCLE_SKIP.bookingCancelled };
    default:
      return { allowed: false, reason: rev.skipReason };
  }
}

export type FrequencyCheckResult = { limited: true; reason: typeof LIFECYCLE_SKIP.frequencyLimitReached } | { limited: false };

export async function evaluateCustomerFrequencyLimit(params: {
  supabase: SupabaseClient;
  customerEmail: string;
  excludeJobId: string;
  jobType: string;
  nowMs?: number;
}): Promise<FrequencyCheckResult> {
  const nowMs = params.nowMs ?? Date.now();
  let normalized = "";
  try {
    normalized = normalizeEmail(params.customerEmail);
  } catch {
    return { limited: false };
  }

  const since24h = new Date(nowMs - DAY_MS).toISOString();
  const since14d = new Date(nowMs - 14 * DAY_MS).toISOString();
  const since7d = new Date(nowMs - 7 * DAY_MS).toISOString();

  const { data: recent24h, error: err24 } = await params.supabase
    .from("booking_lifecycle_jobs")
    .select("id")
    .eq("customer_email", normalized)
    .eq("status", "sent")
    .gte("sent_at", since24h)
    .neq("id", params.excludeJobId)
    .limit(1);

  if (err24) return { limited: false };
  if ((recent24h?.length ?? 0) > 0) {
    return { limited: true, reason: LIFECYCLE_SKIP.frequencyLimitReached };
  }

  const { count, error: err14 } = await params.supabase
    .from("booking_lifecycle_jobs")
    .select("id", { count: "exact", head: true })
    .eq("customer_email", normalized)
    .eq("status", "sent")
    .gte("sent_at", since14d)
    .neq("id", params.excludeJobId);

  if (err14) return { limited: false };
  if ((count ?? 0) >= 3) {
    return { limited: true, reason: LIFECYCLE_SKIP.frequencyLimitReached };
  }

  if (isRebookLifecycleJobType(params.jobType)) {
    const { data: recentRebook, error: errRebook } = await params.supabase
      .from("booking_lifecycle_jobs")
      .select("id")
      .eq("customer_email", normalized)
      .eq("status", "sent")
      .in("job_type", REBOOK_JOB_TYPES)
      .gte("sent_at", since7d)
      .neq("id", params.excludeJobId)
      .limit(1);

    if (errRebook) return { limited: false };
    if ((recentRebook?.length ?? 0) > 0) {
      return { limited: true, reason: LIFECYCLE_SKIP.frequencyLimitReached };
    }
  }

  return { limited: false };
}

export async function logFrequencyLimitSkip(params: {
  jobId: string;
  bookingId: string;
  customerEmail: string;
}): Promise<void> {
  await logSystemEvent({
    level: "info",
    source: "processLifecycleJob",
    message: "lifecycle.frequency_limit.skipped",
    context: {
      jobId: params.jobId,
      bookingId: params.bookingId,
      customerEmail: params.customerEmail,
      skipReason: LIFECYCLE_SKIP.frequencyLimitReached,
    },
  });
}

export function classifySendError(error: string | undefined): "retryable" | "terminal" {
  const msg = (error ?? "").toLowerCase();
  if (!msg) return "retryable";

  const terminalPatterns = [
    "invalid email",
    "invalid recipient",
    "suppressed",
    "bounce",
    "bounced",
    "hard bounce",
    "permanently",
    "unsubscribed",
    "blocked",
    "not a valid",
    "malformed",
  ];
  if (terminalPatterns.some((p) => msg.includes(p))) return "terminal";

  return "retryable";
}

export const TERMINAL_FAILURE_ATTEMPTS = 5;

export type LifecycleCustomerContext = {
  customer_type: "once_off" | "recurring";
  has_active_recurring_plan: boolean;
  has_future_booking: boolean;
};

/** Resolve customer category flags for admin display (best-effort on list rows). */
export async function resolveLifecycleCustomerContext(params: {
  supabase: SupabaseClient;
  userId: string | null;
  customerEmail: string;
  bookingId: string;
  recurringId?: string | null;
  isRecurringGenerated?: boolean | null;
  bookingSnapshot?: BookingSnapshotV1 | null;
}): Promise<LifecycleCustomerContext> {
  const hasRecurring = await customerHasActiveRecurringPlan({
    supabase: params.supabase,
    userId: params.userId,
    recurringId: params.recurringId,
    isRecurringGenerated: params.isRecurringGenerated,
    bookingSnapshot: params.bookingSnapshot,
  });
  const hasFuture = await customerHasFuturePaidBooking({
    supabase: params.supabase,
    userId: params.userId,
    customerEmail: params.customerEmail,
    excludeBookingId: params.bookingId,
  });
  return {
    customer_type: hasRecurring ? "recurring" : "once_off",
    has_active_recurring_plan: hasRecurring,
    has_future_booking: hasFuture,
  };
}
