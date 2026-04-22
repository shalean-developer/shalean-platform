import type { SupabaseClient } from "@supabase/supabase-js";
import { computeLifecycleScheduledIso } from "@/lib/booking/lifecycleSchedule";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";

type Params = {
  supabase: SupabaseClient;
  bookingId: string;
  userId: string | null;
  customerEmail: string;
  amountCents: number;
  paystackReference: string;
  createdAt: string;
  /** From booking snapshot `locked` — drives lifecycle schedule (SAST). */
  appointmentDateYmd: string | null | undefined;
  appointmentTimeHm: string | null | undefined;
};

/**
 * Idempotent-friendly: unique index on (booking_id, job_type) prevents duplicate lifecycle rows.
 * `user_events` booking_created is unique per booking_id.
 */
export async function recordBookingSideEffects(params: Params): Promise<void> {
  const email = params.customerEmail ? normalizeEmail(params.customerEmail) : "";
  const payloadCommon = {
    paystack_reference: params.paystackReference,
    amount_cents: params.amountCents,
  };

  const { error: evErr } = await params.supabase.from("user_events").insert({
    user_id: params.userId,
    event_type: "booking_created",
    booking_id: params.bookingId,
    payload: { ...payloadCommon, customer_email: email || null },
  });

  if (evErr) {
    if (evErr.code !== "23505") {
      await reportOperationalIssue("error", "recordBookingSideEffects", `user_events insert failed: ${evErr.message}`, {
        bookingId: params.bookingId,
        code: evErr.code,
      });
    }
  }

  if (params.userId) {
    const { error: rpcErr } = await params.supabase.rpc("increment_user_profile_stats", {
      p_user_id: params.userId,
      p_amount: params.amountCents,
    });

    if (!rpcErr) {
      await logSystemEvent({
        level: "info",
        source: "recordBookingSideEffects",
        message: "increment_user_profile_stats RPC succeeded",
        context: { bookingId: params.bookingId, userId: params.userId, amountCents: params.amountCents },
      });
    } else {
      await reportOperationalIssue("warn", "recordBookingSideEffects", `RPC increment_user_profile_stats failed: ${rpcErr.message}`, {
        bookingId: params.bookingId,
        userId: params.userId,
        code: rpcErr.code,
      });
      const fallbackErr = await upsertUserProfileManual(params.supabase, params.userId, params.amountCents);
      if (fallbackErr) {
        await reportOperationalIssue("error", "recordBookingSideEffects", `user_profiles manual upsert failed: ${fallbackErr}`, {
          bookingId: params.bookingId,
          userId: params.userId,
          rpcError: rpcErr.message,
        });
      } else {
        await logSystemEvent({
          level: "info",
          source: "recordBookingSideEffects",
          message: "user_profiles updated via manual upsert after RPC failure",
          context: { bookingId: params.bookingId, userId: params.userId },
        });
      }
    }
  }

  if (!email || email.length < 3) return;

  const times = computeLifecycleScheduledIso({
    dateYmd: params.appointmentDateYmd,
    timeHm: params.appointmentTimeHm,
  });

  if (!times) {
    await reportOperationalIssue("warn", "recordBookingSideEffects", "No valid appointment date; skipping lifecycle jobs", {
      bookingId: params.bookingId,
    });
    return;
  }

  const jobs = [
    { job_type: "reminder_24h" as const, scheduled_for: times.reminder24h },
    { job_type: "review_request" as const, scheduled_for: times.reviewRequest },
    { job_type: "rebook_offer" as const, scheduled_for: times.rebookOffer },
  ];

  for (const j of jobs) {
    const { error: jobErr } = await params.supabase.from("booking_lifecycle_jobs").insert({
      booking_id: params.bookingId,
      user_id: params.userId,
      customer_email: email,
      job_type: j.job_type,
      scheduled_for: j.scheduled_for,
      status: "pending",
      attempts: 0,
      payload: payloadCommon,
    });
    if (jobErr && jobErr.code !== "23505") {
      await reportOperationalIssue("warn", "recordBookingSideEffects", `lifecycle job insert: ${jobErr.message}`, {
        bookingId: params.bookingId,
        jobType: j.job_type,
      });
    }
  }
}

async function upsertUserProfileManual(
  admin: SupabaseClient,
  userId: string,
  amountCents: number,
): Promise<string | null> {
  const { data: row, error: selErr } = await admin
    .from("user_profiles")
    .select("booking_count, total_spent_cents")
    .eq("id", userId)
    .maybeSingle();

  if (selErr) return selErr.message;

  const prevCount = row && typeof row === "object" && "booking_count" in row ? Number((row as { booking_count: number }).booking_count) : 0;
  const prevSpent =
    row && typeof row === "object" && "total_spent_cents" in row
      ? Number((row as { total_spent_cents: number }).total_spent_cents)
      : 0;

  const { error: upErr } = await admin.from("user_profiles").upsert(
    {
      id: userId,
      booking_count: (Number.isFinite(prevCount) ? prevCount : 0) + 1,
      total_spent_cents: (Number.isFinite(prevSpent) ? prevSpent : 0) + amountCents,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  return upErr?.message ?? null;
}
