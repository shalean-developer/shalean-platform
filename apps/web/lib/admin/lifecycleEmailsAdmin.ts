import type { SupabaseClient } from "@supabase/supabase-js";
import {
  customerHasActiveRecurringPlan,
  customerHasFuturePaidBooking,
  isRebookLifecycleJobType,
} from "@/lib/booking/lifecycleEmailGuards";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";

export type LifecycleEmailJobFilters = {
  status?: string | null;
  job_type?: string | null;
  search?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  customer_type?: string | null;
  queue?: string | null;
  skipped_reason?: string | null;
};

export type LifecycleEmailJobRow = {
  id: string;
  booking_id: string;
  user_id: string | null;
  customer_email: string;
  job_type: string;
  scheduled_for: string;
  status: string;
  attempts: number;
  sent_at: string | null;
  last_error: string | null;
  skipped_reason: string | null;
  processed_at: string | null;
  created_at: string;
  customer_type?: "once_off" | "recurring";
  has_active_recurring_plan?: boolean;
  has_future_booking?: boolean;
};

export type LifecycleEmailSummary = {
  pending: number;
  sent: number;
  failed_retryable: number;
  failed_terminal: number;
  cancelled: number;
  skipped: number;
  due_today: number;
  due_next_7d: number;
};

export const LIFECYCLE_EMAIL_PAGE_SIZE = 60;

const JOB_TYPES = ["reminder_24h", "review_request", "rebook_offer", "rebook_reminder"] as const;
const STATUSES = [
  "pending",
  "processing",
  "sent",
  "cancelled",
  "skipped",
  "failed_retryable",
  "failed_terminal",
] as const;

export function parseLifecycleEmailsLimit(raw: string | null | undefined): number {
  const n = parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n < 1) return LIFECYCLE_EMAIL_PAGE_SIZE;
  return Math.min(n, 200);
}

export function parseLifecycleEmailsOffset(raw: string | null | undefined): number {
  const n = parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function sanitizeSearch(raw: string | null | undefined): string | null {
  const trimmed = String(raw ?? "").trim().slice(0, 100);
  if (!trimmed) return null;
  return trimmed.replace(/[%_]/g, "");
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Supabase query builders recurse deeply in generics — keep this loosely typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyLifecycleEmailJobFilters(query: any, filters: LifecycleEmailJobFilters): any {
  let q = query;
  if (filters.status && STATUSES.includes(filters.status as (typeof STATUSES)[number])) {
    q = q.eq("status", filters.status);
  }
  if (filters.job_type === "rebook") {
    q = q.in("job_type", ["rebook_offer", "rebook_reminder"]);
  } else if (filters.job_type && JOB_TYPES.includes(filters.job_type as (typeof JOB_TYPES)[number])) {
    q = q.eq("job_type", filters.job_type);
  }
  if (filters.date_from) {
    q = q.gte("scheduled_for", `${filters.date_from}T00:00:00.000Z`);
  }
  if (filters.date_to) {
    q = q.lte("scheduled_for", `${filters.date_to}T23:59:59.999Z`);
  }
  if (filters.queue === "due") {
    q = q.eq("status", "pending").lte("scheduled_for", new Date().toISOString());
  } else if (filters.queue === "future") {
    q = q.gt("scheduled_for", new Date().toISOString());
  }
  if (filters.skipped_reason?.trim()) {
    q = q.eq("skipped_reason", filters.skipped_reason.trim().slice(0, 500));
  }
  const search = sanitizeSearch(filters.search);
  if (search) {
    if (UUID_RE.test(search)) {
      q = q.or(`booking_id.eq.${search},id.eq.${search}`);
    } else {
      q = q.or(`customer_email.ilike.%${search}%,last_error.ilike.%${search}%,skipped_reason.ilike.%${search}%`);
    }
  }
  return q;
}

export async function enrichLifecycleEmailJobs(
  admin: SupabaseClient,
  jobs: LifecycleEmailJobRow[],
): Promise<LifecycleEmailJobRow[]> {
  if (jobs.length === 0) return jobs;

  const bookingIds = [...new Set(jobs.map((j) => j.booking_id))];
  const { data: bookings } = await admin
    .from("bookings")
    .select("id, user_id, recurring_id, is_recurring_generated, booking_snapshot")
    .in("id", bookingIds);

  const bookingById = new Map(
    (bookings ?? []).map((b) => [String(b.id), b as Record<string, unknown>]),
  );

  const enriched: LifecycleEmailJobRow[] = [];
  for (const job of jobs) {
    const b = bookingById.get(job.booking_id);
    const userId =
      (typeof b?.user_id === "string" ? b.user_id : null) ??
      (typeof job.user_id === "string" ? job.user_id : null);
    const hasRecurring = b
      ? await customerHasActiveRecurringPlan({
          supabase: admin,
          userId,
          recurringId: typeof b.recurring_id === "string" ? b.recurring_id : null,
          isRecurringGenerated: b.is_recurring_generated as boolean | null | undefined,
          bookingSnapshot: b.booking_snapshot as BookingSnapshotV1 | null,
        })
      : false;
    const hasFuture = await customerHasFuturePaidBooking({
      supabase: admin,
      userId,
      customerEmail: job.customer_email,
      excludeBookingId: job.booking_id,
    });

    enriched.push({
      ...job,
      customer_type: hasRecurring ? "recurring" : "once_off",
      has_active_recurring_plan: hasRecurring,
      has_future_booking: hasFuture,
    });
  }

  return enriched;
}

export async function filterJobsByCustomerType(
  jobs: LifecycleEmailJobRow[],
  customerType: string | null | undefined,
): Promise<LifecycleEmailJobRow[]> {
  if (!customerType || (customerType !== "once_off" && customerType !== "recurring")) {
    return jobs;
  }
  return jobs.filter((j) => j.customer_type === customerType);
}

export async function computeLifecycleEmailSummary(
  admin: SupabaseClient,
): Promise<LifecycleEmailSummary> {
  const now = new Date();
  const nowIso = now.toISOString();
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);
  const weekEnd = new Date(todayStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  const countStatus = async (status: string) => {
    const { count } = await admin
      .from("booking_lifecycle_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", status);
    return count ?? 0;
  };

  const [pending, sent, failed_retryable, failed_terminal, cancelled, skipped, dueToday, due7d] =
    await Promise.all([
      countStatus("pending"),
      countStatus("sent"),
      countStatus("failed_retryable"),
      countStatus("failed_terminal"),
      countStatus("cancelled"),
      countStatus("skipped"),
      admin
        .from("booking_lifecycle_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .gte("scheduled_for", todayStart.toISOString())
        .lt("scheduled_for", todayEnd.toISOString())
        .then((r) => r.count ?? 0),
      admin
        .from("booking_lifecycle_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .gte("scheduled_for", nowIso)
        .lt("scheduled_for", weekEnd.toISOString())
        .then((r) => r.count ?? 0),
    ]);

  return {
    pending,
    sent,
    failed_retryable,
    failed_terminal,
    cancelled,
    skipped,
    due_today: dueToday,
    due_next_7d: due7d,
  };
}

export const JOB_SELECT =
  "id, booking_id, user_id, customer_email, job_type, scheduled_for, status, attempts, sent_at, last_error, skipped_reason, processed_at, created_at";

export { isRebookLifecycleJobType };
