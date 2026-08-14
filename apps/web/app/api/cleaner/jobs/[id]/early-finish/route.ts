import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { cleanerHasBookingAccess } from "@/lib/cleaner/cleanerBookingAccess";
import { isEarlyFinishReason } from "@/lib/cleaner/cleanerEarlyFinish";
import { evaluateCleanerJobCompletionGate } from "@/lib/cleaner/cleanerJobCompletionGate";
import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import { sendSms } from "@/lib/twilioSend";
import { writeNotificationLog } from "@/lib/notifications/notificationLogWrite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bookingId } = await ctx.params;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) {
    return NextResponse.json({ error: session.error ?? "Unauthorized." }, { status: session.status ?? 401 });
  }

  const body = (await request.json().catch(() => null)) as { reason?: string; note?: string } | null;
  if (!isEarlyFinishReason(body?.reason)) {
    return NextResponse.json({ error: "Select why the job finished early." }, { status: 400 });
  }

  const { data: booking, error } = await admin
    .from("bookings")
    .select("id,cleaner_id,payout_owner_cleaner_id,team_id,is_team_job,status,started_at,duration_minutes,estimated_duration_minutes,duration_hours,pricing_summary,booking_snapshot,price_snapshot,rooms,bathrooms,extras,service,service_slug,customer_name,customer_phone")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  const canAccess = await cleanerHasBookingAccess(admin, session.cleanerId, {
    id: bookingId,
    cleaner_id: booking.cleaner_id ?? null,
    payout_owner_cleaner_id: booking.payout_owner_cleaner_id ?? null,
    team_id: booking.team_id ?? null,
    is_team_job: booking.is_team_job === true,
  });
  if (!canAccess) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (String(booking.status ?? "").toLowerCase() !== "in_progress") {
    return NextResponse.json({ error: "The job must be in progress before requesting an early finish." }, { status: 400 });
  }

  const gate = evaluateCleanerJobCompletionGate(booking);
  if (gate.ok) {
    return NextResponse.json({ error: "This job can already be completed normally.", code: "normal_completion_available" }, { status: 409 });
  }
  if (gate.code !== "minimum_duration_not_elapsed") {
    return NextResponse.json({ error: gate.error, code: gate.code }, { status: 422 });
  }

  const { data: existing } = await admin
    .from("cleaner_early_finish_requests")
    .select("id,status,approval_token")
    .eq("booking_id", bookingId)
    .eq("cleaner_id", session.cleanerId)
    .in("status", ["pending", "customer_approved", "admin_approved"])
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: true, requestId: existing.id, status: existing.status, duplicate: true });
  }

  const note = String(body?.note ?? "").trim().slice(0, 500);
  const { data: created, error: insertError } = await admin
    .from("cleaner_early_finish_requests")
    .insert({
      booking_id: bookingId,
      cleaner_id: session.cleanerId,
      reason: body!.reason,
      quoted_duration_minutes: gate.durationMinutes ?? null,
      elapsed_minutes_at_request: gate.elapsedMinutes != null ? Math.floor(gate.elapsedMinutes) : null,
      metadata: { note: note || null, remaining_minutes: gate.remainingMinutes ?? null },
    })
    .select("id,approval_token,status")
    .single();
  if (insertError || !created) {
    return NextResponse.json({ error: insertError?.message ?? "Could not create early-finish request." }, { status: 500 });
  }

  const token = String(created.approval_token);
  const confirmUrl = `${getPublicAppUrlBase()}/early-finish/${encodeURIComponent(token)}`;
  const customerName = String(booking.customer_name ?? "there").trim() || "there";
  const smsMessage = `Hi ${customerName}, your Shalean cleaner has finished earlier than estimated. Please confirm whether the booked cleaning is complete: ${confirmUrl}`;
  const sms = await sendSms({ toPhone: String(booking.customer_phone ?? ""), message: smsMessage, recipientKind: "customer" });

  await writeNotificationLog({
    channel: "sms",
    template_key: "customer_early_finish_confirmation",
    recipient: String(booking.customer_phone ?? ""),
    status: sms.ok ? "sent" : "failed",
    error: sms.ok ? undefined : sms.error,
    provider: "twilio",
    role: "customer",
    event_type: "early_finish_confirmation",
    payload: { booking_id: bookingId, request_id: created.id, confirmation_url: confirmUrl },
  });

  return NextResponse.json({
    ok: true,
    requestId: created.id,
    status: created.status,
    customerNotification: sms.ok ? "sent" : "failed",
  });
}
