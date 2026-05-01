import type { SupabaseClient } from "@supabase/supabase-js";
import { computeLifecycleScheduledIso } from "@/lib/booking/lifecycleSchedule";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { logPaymentStructured } from "@/lib/observability/paymentStructuredLog";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";

export type ScheduleLifecycleJobsParams = {
  bookingId: string;
  userId: string | null;
  customerEmail: string;
  amountCents: number;
  paystackReference: string;
  appointmentDateYmd: string | null | undefined;
  appointmentTimeHm: string | null | undefined;
};

/**
 * Inserts `booking_lifecycle_jobs` rows (idempotent via unique index). Sets `bookings.lifecycle_issue` on any failure.
 */
export async function scheduleBookingLifecycleJobs(
  supabase: SupabaseClient,
  params: ScheduleLifecycleJobsParams,
): Promise<{ ok: boolean }> {
  const email = params.customerEmail ? normalizeEmail(params.customerEmail) : "";
  const payloadCommon = {
    paystack_reference: params.paystackReference,
    amount_cents: params.amountCents,
  };

  if (!email || email.length < 3) {
    return { ok: true };
  }

  const times = computeLifecycleScheduledIso({
    dateYmd: params.appointmentDateYmd,
    timeHm: params.appointmentTimeHm,
  });

  if (!times) {
    await reportOperationalIssue("warn", "scheduleBookingLifecycleJobs", "No valid appointment date; skipping lifecycle jobs", {
      bookingId: params.bookingId,
    });
    return { ok: true };
  }

  const jobs = [
    { job_type: "reminder_24h" as const, scheduled_for: times.reminder24h },
    { job_type: "review_request" as const, scheduled_for: times.reviewRequest },
    { job_type: "rebook_offer" as const, scheduled_for: times.rebookOffer },
  ];

  let ok = true;
  try {
    for (const j of jobs) {
      try {
        const { error: jobErr } = await supabase.from("booking_lifecycle_jobs").insert({
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
          ok = false;
          await reportOperationalIssue("warn", "scheduleBookingLifecycleJobs", `lifecycle job insert: ${jobErr.message}`, {
            bookingId: params.bookingId,
            jobType: j.job_type,
            code: jobErr.code,
          });
        }
      } catch (err) {
        ok = false;
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[REMINDER JOB FAILED]", { bookingId: params.bookingId, jobType: j.job_type, err });
        await reportOperationalIssue("error", "scheduleBookingLifecycleJobs", msg, {
          bookingId: params.bookingId,
          jobType: j.job_type,
        });
      }
    }
  } catch (err) {
    ok = false;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[REMINDER JOB FAILED]", { bookingId: params.bookingId, err });
    await reportOperationalIssue("error", "scheduleBookingLifecycleJobs", msg, { bookingId: params.bookingId });
  }

  if (!ok) {
    logPaymentStructured("lifecycle_failed", { booking_id: params.bookingId });
    await logSystemEvent({
      level: "error",
      source: "booking_lifecycle",
      message: "Reminder job scheduling failed",
      context: { bookingId: params.bookingId },
    });
    const { error: upErr } = await supabase.from("bookings").update({ lifecycle_issue: true }).eq("id", params.bookingId);
    if (upErr) {
      await reportOperationalIssue("warn", "scheduleBookingLifecycleJobs", `lifecycle_issue flag update failed: ${upErr.message}`, {
        bookingId: params.bookingId,
      });
    }
  }

  return { ok };
}

export async function retryLifecycleJobsForBooking(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<{ repaired: boolean }> {
  const { data: row, error } = await supabase
    .from("bookings")
    .select("id, user_id, customer_email, amount_paid_cents, paystack_reference, date, time, booking_snapshot, lifecycle_issue")
    .eq("id", bookingId)
    .maybeSingle();

  if (error || !row || typeof row !== "object") {
    return { repaired: false };
  }

  const r = row as Record<string, unknown>;
  const snap = r.booking_snapshot as { locked?: { date?: string; time?: string } } | null | undefined;
  const dateYmd = (typeof r.date === "string" ? r.date : snap?.locked?.date) ?? null;
  const timeHm = (typeof r.time === "string" ? r.time : snap?.locked?.time) ?? null;
  const paystackRef = typeof r.paystack_reference === "string" ? r.paystack_reference : "";
  const cents = typeof r.amount_paid_cents === "number" ? r.amount_paid_cents : 0;
  const custEmail = typeof r.customer_email === "string" ? r.customer_email : "";
  const uid = typeof r.user_id === "string" ? r.user_id : null;

  const { ok } = await scheduleBookingLifecycleJobs(supabase, {
    bookingId,
    userId: uid,
    customerEmail: custEmail,
    amountCents: cents,
    paystackReference: paystackRef || bookingId,
    appointmentDateYmd: dateYmd,
    appointmentTimeHm: timeHm,
  });

  if (ok) {
    await supabase.from("bookings").update({ lifecycle_issue: false }).eq("id", bookingId);
    return { repaired: true };
  }
  return { repaired: false };
}
