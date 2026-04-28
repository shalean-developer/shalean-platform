/**
 * Review SMS prompts (initial + optional 24h reminder).
 * Customer Meta WhatsApp remains off-policy; Twilio SMS only here.
 * Future: optional Twilio WhatsApp channel via env when product enables customer WhatsApp.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import { customerPhoneToE164 } from "@/lib/notifications/customerPhoneNormalize";
import { sendSmsFallback } from "@/lib/notifications/smsFallback";
import { logReviewKpiEvent } from "@/lib/reviews/reviewKpiServer";

export type ReviewPromptKind = "initial" | "reminder";

function firstNameFromBooking(row: {
  customer_name?: string | null;
  booking_snapshot?: unknown;
}): string {
  const snap = row.booking_snapshot as BookingSnapshotV1 | null;
  const snapName = snap?.customer && typeof snap.customer.name === "string" ? snap.customer.name.trim() : "";
  const fromSnap = snapName.split(/\s+/)[0] ?? "";
  const rowName = String(row.customer_name ?? "").trim();
  const fromRow = rowName.split(/\s+/)[0] ?? "";
  return (fromSnap || fromRow || "there").slice(0, 40);
}

export function buildReviewPromptSmsBody(params: {
  firstName: string;
  bookingId: string;
  kind: ReviewPromptKind;
}): string {
  const link = `${getPublicAppUrlBase()}/review?booking=${encodeURIComponent(params.bookingId)}`;
  if (params.kind === "reminder") {
    return `Hi ${params.firstName}, quick reminder — we'd love your feedback on your Shalean clean:\n${link}`;
  }
  return `Hi ${params.firstName}, thanks for choosing Shalean 🙌\nPlease rate your cleaning experience:\n${link}`;
}

async function deliverReviewPromptSms(params: {
  bookingId: string;
  phoneRaw: string;
  firstName: string;
  kind: ReviewPromptKind;
}): Promise<boolean> {
  const body = buildReviewPromptSmsBody({
    firstName: params.firstName,
    bookingId: params.bookingId,
    kind: params.kind,
  });
  const e164 = customerPhoneToE164(params.phoneRaw);
  if (!e164) {
    logReviewKpiEvent("review_prompt_sent", {
      booking_id: params.bookingId,
      channel: "sms",
      sent: false,
      error: "invalid_phone_e164",
      prompt_kind: params.kind,
    });
    return false;
  }

  const smsRes = await sendSmsFallback({
    toE164: e164,
    body,
    context: { bookingId: params.bookingId, channel: "review_prompt_sms", prompt_kind: params.kind },
    deliveryLog: {
      templateKey: params.kind === "reminder" ? "review_prompt_sms_reminder" : "review_prompt_sms",
      bookingId: params.bookingId,
      eventType: "review_prompt",
      role: "customer",
    },
    smsRole: "primary",
    recipientKind: "customer",
  });

  logReviewKpiEvent("review_prompt_sent", {
    booking_id: params.bookingId,
    channel: "sms",
    sent: smsRes.sent,
    error: smsRes.error,
    prompt_kind: params.kind,
  });
  return smsRes.sent;
}

type BookingRow = {
  id: string;
  status?: string | null;
  cleaner_id?: string | null;
  customer_phone?: string | null;
  customer_name?: string | null;
  booking_snapshot?: unknown;
};

async function hasReview(supabase: SupabaseClient, bookingId: string): Promise<boolean> {
  const { data } = await supabase.from("reviews").select("id").eq("booking_id", bookingId).maybeSingle();
  return Boolean(data);
}

/**
 * Enqueue deferred review SMS (30–60 min first send, 24h reminder window stored).
 */
export async function enqueueReviewSmsPromptQueue(
  supabase: SupabaseClient,
  bookingId: string,
): Promise<void> {
  const delayMin = 30 + Math.floor(Math.random() * 31);
  const firstDue = new Date(Date.now() + delayMin * 60 * 1000).toISOString();
  const reminderDue = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from("review_sms_prompt_queue").upsert(
    {
      booking_id: bookingId,
      first_due_at: firstDue,
      reminder_due_at: reminderDue,
    },
    { onConflict: "booking_id" },
  );
  if (error) {
    console.error("[enqueueReviewSmsPromptQueue]", error.message);
  }
}

export type ProcessReviewSmsPromptQueueResult = {
  firstSent: number;
  remindersSent: number;
  skipped: number;
};

/**
 * Cron worker: first SMS after `first_due_at`, one reminder after `reminder_due_at` if still no review.
 */
export async function processReviewSmsPromptQueue(
  supabase: SupabaseClient,
  opts?: { limit?: number },
): Promise<ProcessReviewSmsPromptQueueResult> {
  const limit = opts?.limit ?? 25;
  const nowIso = new Date().toISOString();
  let firstSent = 0;
  let remindersSent = 0;
  let skipped = 0;

  const { data: firstDueRows, error: q1 } = await supabase
    .from("review_sms_prompt_queue")
    .select("booking_id")
    .is("first_sent_at", null)
    .lte("first_due_at", nowIso)
    .limit(limit);

  if (q1) {
    console.error("[processReviewSmsPromptQueue] first select", q1.message);
    return { firstSent: 0, remindersSent: 0, skipped: 0 };
  }

  const firstIds = (firstDueRows ?? []).map((r) => String((r as { booking_id: string }).booking_id)).filter(Boolean);
  if (firstIds.length) {
    const { data: bookings, error: bErr } = await supabase
      .from("bookings")
      .select("id, status, cleaner_id, customer_phone, customer_name, booking_snapshot")
      .in("id", firstIds);
    if (bErr) {
      console.error("[processReviewSmsPromptQueue] bookings", bErr.message);
    } else {
      for (const b of (bookings ?? []) as BookingRow[]) {
        const bid = b.id;
        if (String(b.status ?? "").toLowerCase() !== "completed" || !b.cleaner_id) {
          await supabase.from("review_sms_prompt_queue").delete().eq("booking_id", bid);
          skipped++;
          continue;
        }
        if (await hasReview(supabase, bid)) {
          await supabase.from("review_sms_prompt_queue").delete().eq("booking_id", bid);
          skipped++;
          continue;
        }
        const phone = String(b.customer_phone ?? "").trim();
        if (!phone) {
          skipped++;
          continue;
        }
        const { data: lockRow, error: lockErr } = await supabase
          .from("review_sms_prompt_queue")
          .update({ first_sent_at: nowIso })
          .eq("booking_id", bid)
          .is("first_sent_at", null)
          .select("booking_id")
          .maybeSingle();
        if (lockErr || !lockRow) {
          skipped++;
          continue;
        }
        const ok = await deliverReviewPromptSms({
          bookingId: bid,
          phoneRaw: phone,
          firstName: firstNameFromBooking(b),
          kind: "initial",
        });
        if (ok) {
          firstSent++;
        } else {
          await supabase.from("review_sms_prompt_queue").update({ first_sent_at: null }).eq("booking_id", bid);
          skipped++;
        }
      }
    }
  }

  const { data: remRows, error: q2 } = await supabase
    .from("review_sms_prompt_queue")
    .select("booking_id")
    .not("first_sent_at", "is", null)
    .is("reminder_sent_at", null)
    .lte("reminder_due_at", nowIso)
    .limit(limit);

  if (q2) {
    console.error("[processReviewSmsPromptQueue] reminder select", q2.message);
    return { firstSent, remindersSent, skipped };
  }

  const remIds = (remRows ?? []).map((r) => String((r as { booking_id: string }).booking_id)).filter(Boolean);
  if (remIds.length) {
    const { data: bookings2, error: b2Err } = await supabase
      .from("bookings")
      .select("id, status, cleaner_id, customer_phone, customer_name, booking_snapshot")
      .in("id", remIds);
    if (b2Err) {
      console.error("[processReviewSmsPromptQueue] bookings2", b2Err.message);
    } else {
      for (const b of (bookings2 ?? []) as BookingRow[]) {
        const bid = b.id;
        if (String(b.status ?? "").toLowerCase() !== "completed" || !b.cleaner_id) {
          await supabase.from("review_sms_prompt_queue").delete().eq("booking_id", bid);
          skipped++;
          continue;
        }
        if (await hasReview(supabase, bid)) {
          await supabase.from("review_sms_prompt_queue").delete().eq("booking_id", bid);
          skipped++;
          continue;
        }
        const phone = String(b.customer_phone ?? "").trim();
        if (!phone) {
          skipped++;
          continue;
        }
        const { data: lockR2, error: lockE2 } = await supabase
          .from("review_sms_prompt_queue")
          .update({ reminder_sent_at: nowIso })
          .eq("booking_id", bid)
          .is("reminder_sent_at", null)
          .not("first_sent_at", "is", null)
          .select("booking_id")
          .maybeSingle();
        if (lockE2 || !lockR2) {
          skipped++;
          continue;
        }
        const ok = await deliverReviewPromptSms({
          bookingId: bid,
          phoneRaw: phone,
          firstName: firstNameFromBooking(b),
          kind: "reminder",
        });
        if (ok) {
          remindersSent++;
        } else {
          await supabase.from("review_sms_prompt_queue").update({ reminder_sent_at: null }).eq("booking_id", bid);
          skipped++;
        }
      }
    }
  }

  return { firstSent, remindersSent, skipped };
}
