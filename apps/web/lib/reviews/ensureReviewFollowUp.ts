import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { evaluateCustomerReviewSubmissionEligibility } from "@/lib/reviews/customerReviewFollowUpContract";

const REVIEW_DELAY_MS = 30 * 60 * 1000;

export type EnsureReviewFollowUpResult =
  | {
      ok: true;
      created: boolean;
      reason:
        | "created"
        | "revived_existing_job"
        | "existing_active_job"
        | "existing_sent_job"
        | "existing_review"
        | "ineligible"
        | "missing_email"
        | "duplicate_job";
    }
  | { ok: false; error: string };

/**
 * Ensures one usable review_request lifecycle job exists after authoritative completion.
 *
 * This is intentionally completion-time, not payment-time only, so recurring,
 * monthly-invoice, admin-created, repaired and other legitimate completion paths
 * converge on the same customer review follow-up.
 *
 * Existing terminal/cancelled/skipped rows are revived because the unique
 * (booking_id, job_type) contract would otherwise prevent a healthy replacement.
 */
export async function ensureReviewFollowUpForCompletedBooking(
  supabase: SupabaseClient,
  booking: Record<string, unknown>,
): Promise<EnsureReviewFollowUpResult> {
  const bookingId = String(booking.id ?? "").trim();
  if (!bookingId) return { ok: false, error: "missing_booking_id" };

  const eligibility = evaluateCustomerReviewSubmissionEligibility(booking);
  if (!eligibility.allowed) {
    return { ok: true, created: false, reason: "ineligible" };
  }

  const rawEmail = String(booking.customer_email ?? "").trim();
  let customerEmail = "";
  try {
    customerEmail = rawEmail ? normalizeEmail(rawEmail) : "";
  } catch {
    customerEmail = "";
  }
  if (!customerEmail) {
    return { ok: true, created: false, reason: "missing_email" };
  }

  const { data: existingReview, error: reviewErr } = await supabase
    .from("reviews")
    .select("id")
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (reviewErr) {
    await reportOperationalIssue("warn", "ensureReviewFollowUp", reviewErr.message, {
      bookingId,
      phase: "review_lookup",
    });
    return { ok: false, error: reviewErr.message };
  }
  if (existingReview) {
    return { ok: true, created: false, reason: "existing_review" };
  }

  const scheduledFor = new Date(Date.now() + REVIEW_DELAY_MS).toISOString();

  const { data: existingJob, error: jobLookupErr } = await supabase
    .from("booking_lifecycle_jobs")
    .select("id, status, sent_at, processed_at")
    .eq("booking_id", bookingId)
    .eq("job_type", "review_request")
    .maybeSingle();

  if (jobLookupErr) {
    await reportOperationalIssue("warn", "ensureReviewFollowUp", jobLookupErr.message, {
      bookingId,
      phase: "job_lookup",
    });
    return { ok: false, error: jobLookupErr.message };
  }

  if (existingJob) {
    const status = String((existingJob as { status?: string | null }).status ?? "").trim().toLowerCase();
    const sentAt = String((existingJob as { sent_at?: string | null }).sent_at ?? "").trim();

    if (sentAt || status === "sent") {
      return { ok: true, created: false, reason: "existing_sent_job" };
    }
    if (status === "pending" || status === "failed_retryable") {
      return { ok: true, created: false, reason: "existing_active_job" };
    }
    if (status === "processing") {
      const processedAt = Date.parse(
        String((existingJob as { processed_at?: string | null }).processed_at ?? ""),
      );
      const processingLeaseMs = 10 * 60 * 1000;
      if (Number.isFinite(processedAt) && Date.now() - processedAt < processingLeaseMs) {
        return { ok: true, created: false, reason: "existing_active_job" };
      }
      // Stale processing means a worker likely died after claiming the row.
      // Fall through to the same safe revive path as other recoverable states.
    }

    let reviveQuery = supabase
      .from("booking_lifecycle_jobs")
      .update({
        customer_email: customerEmail,
        status: "pending",
        attempts: 0,
        sent_at: null,
        last_error: null,
        skipped_reason: null,
        processed_at: null,
        scheduled_for: scheduledFor,
        payload: { source: "completion_repair_v1" },
      })
      .eq("id", String((existingJob as { id: string }).id))
      .is("sent_at", null);

    // A stale processing worker may still finish concurrently. Fence revival
    // against the exact processing lease we observed so we never overwrite a
    // later successful send back to pending.
    if (status === "processing") {
      const observedProcessedAt = String(
        (existingJob as { processed_at?: string | null }).processed_at ?? "",
      ).trim();
      reviveQuery = reviveQuery.eq("status", "processing");
      if (observedProcessedAt) {
        reviveQuery = reviveQuery.eq("processed_at", observedProcessedAt);
      }
    } else {
      reviveQuery = reviveQuery.eq("status", status);
    }

    const { data: revivedRow, error: reviveErr } = await reviveQuery
      .select("id")
      .maybeSingle();

    if (reviveErr) {
      await reportOperationalIssue("warn", "ensureReviewFollowUp", reviveErr.message, {
        bookingId,
        phase: "job_revive",
      });
      return { ok: false, error: reviveErr.message };
    }

    if (!revivedRow) {
      // State changed after our read (most importantly: a concurrent worker may
      // have sent successfully). Re-read instead of forcing the row backwards.
      const { data: latestJob, error: latestErr } = await supabase
        .from("booking_lifecycle_jobs")
        .select("status, sent_at")
        .eq("id", String((existingJob as { id: string }).id))
        .maybeSingle();

      if (latestErr) {
        await reportOperationalIssue("warn", "ensureReviewFollowUp", latestErr.message, {
          bookingId,
          phase: "job_revive_reread",
        });
        return { ok: false, error: latestErr.message };
      }

      const latestStatus = String(
        (latestJob as { status?: string | null } | null)?.status ?? "",
      ).trim().toLowerCase();
      const latestSentAt = String(
        (latestJob as { sent_at?: string | null } | null)?.sent_at ?? "",
      ).trim();

      if (latestSentAt || latestStatus === "sent") {
        return { ok: true, created: false, reason: "existing_sent_job" };
      }
      return { ok: true, created: false, reason: "existing_active_job" };
    }

    return { ok: true, created: false, reason: "revived_existing_job" };
  }

  const { error } = await supabase.from("booking_lifecycle_jobs").insert({
    booking_id: bookingId,
    user_id: null,
    customer_email: customerEmail,
    job_type: "review_request",
    scheduled_for: scheduledFor,
    status: "pending",
    attempts: 0,
    payload: { source: "completion_ensure_v1" },
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: true, created: false, reason: "duplicate_job" };
    }
    await reportOperationalIssue("warn", "ensureReviewFollowUp", error.message, {
      bookingId,
      phase: "job_insert",
    });
    return { ok: false, error: error.message };
  }

  return { ok: true, created: true, reason: "created" };
}


export type RepairRecentReviewFollowUpsResult = {
  scanned: number;
  created: number;
  revived: number;
  alreadyHealthy: number;
  skipped: number;
  failed: number;
};

/**
 * Bounded operational self-heal for completion paths that missed notification
 * fan-out. Defaults to the last 24 hours and 20 rows so it cannot become a
 * historical bulk-send mechanism.
 */
export async function repairRecentMissingReviewFollowUps(
  supabase: SupabaseClient,
  opts?: { lookbackHours?: number; limit?: number },
): Promise<RepairRecentReviewFollowUpsResult> {
  const lookbackHours = Math.min(Math.max(opts?.lookbackHours ?? 24, 1), 48);
  const repairLimit = Math.min(Math.max(opts?.limit ?? 20, 1), 50);
  const cutoff = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();
  const pageSize = 100;
  const maxScan = 500;

  const out: RepairRecentReviewFollowUpsResult = {
    scanned: 0,
    created: 0,
    revived: 0,
    alreadyHealthy: 0,
    skipped: 0,
    failed: 0,
  };

  let offset = 0;
  let repairs = 0;

  while (offset < maxScan && repairs < repairLimit) {
    const { data, error } = await supabase
      .from("bookings")
      .select(
        "id, customer_email, status, completed_at, cleaner_id, payout_owner_cleaner_id, is_team_job, team_id",
      )
      .gte("completed_at", cutoff)
      .order("completed_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      await reportOperationalIssue("warn", "repairRecentReviewFollowUps", error.message, {
        phase: "completed_booking_scan",
        lookbackHours,
        repairLimit,
        offset,
      });
      out.failed++;
      break;
    }

    const rows = (data ?? []) as Record<string, unknown>[];
    if (rows.length === 0) break;

    const ids = rows.map((row) => String(row.id ?? "").trim()).filter(Boolean);
    const [{ data: existingJobs, error: jobsErr }, { data: existingReviews, error: reviewsErr }] =
      await Promise.all([
        supabase
          .from("booking_lifecycle_jobs")
          .select("booking_id, status, sent_at, processed_at")
          .in("booking_id", ids)
          .eq("job_type", "review_request"),
        supabase.from("reviews").select("booking_id").in("booking_id", ids),
      ]);

    if (jobsErr || reviewsErr) {
      const message = jobsErr?.message ?? reviewsErr?.message ?? "review repair batch lookup failed";
      await reportOperationalIssue("warn", "repairRecentReviewFollowUps", message, {
        phase: "batch_lookup",
        offset,
      });
      out.failed++;
      break;
    }

    const reviewed = new Set(
      (existingReviews ?? []).map((row) => String((row as { booking_id?: string }).booking_id ?? "")).filter(Boolean),
    );
    const jobsByBooking = new Map<string, { status: string; sent_at: string | null; processed_at: string | null }>();
    for (const row of existingJobs ?? []) {
      const bookingId = String((row as { booking_id?: string }).booking_id ?? "").trim();
      if (!bookingId) continue;
      jobsByBooking.set(bookingId, {
        status: String((row as { status?: string | null }).status ?? "").trim().toLowerCase(),
        sent_at: (row as { sent_at?: string | null }).sent_at ?? null,
        processed_at: (row as { processed_at?: string | null }).processed_at ?? null,
      });
    }

    for (const row of rows) {
      out.scanned++;
      const bookingId = String(row.id ?? "").trim();
      if (!bookingId) {
        out.skipped++;
        continue;
      }

      if (reviewed.has(bookingId)) {
        out.skipped++;
        continue;
      }

      const existing = jobsByBooking.get(bookingId);
      if (existing) {
        if (existing.sent_at || existing.status === "sent") {
          out.alreadyHealthy++;
          continue;
        }
        if (existing.status === "pending" || existing.status === "failed_retryable") {
          out.alreadyHealthy++;
          continue;
        }
        if (existing.status === "processing") {
          const processedAt = Date.parse(String(existing.processed_at ?? ""));
          if (Number.isFinite(processedAt) && Date.now() - processedAt < 10 * 60 * 1000) {
            out.alreadyHealthy++;
            continue;
          }
        }
      }

      const result = await ensureReviewFollowUpForCompletedBooking(supabase, row);
      if (!result.ok) {
        out.failed++;
        continue;
      }
      if (result.reason === "created") {
        out.created++;
        repairs++;
      } else if (result.reason === "revived_existing_job") {
        out.revived++;
        repairs++;
      } else if (
        result.reason === "existing_active_job" ||
        result.reason === "existing_sent_job" ||
        result.reason === "duplicate_job"
      ) {
        out.alreadyHealthy++;
      } else {
        out.skipped++;
      }

      if (repairs >= repairLimit) break;
    }

    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return out;
}
