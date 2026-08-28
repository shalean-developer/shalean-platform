import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { safeResendSend } from "@/lib/email/safeResendSend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RETRY_DELAYS_MINUTES = [5, 30, 120, 1440];

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}` || new URL(request.url).searchParams.get("secret") === secret;
}

export async function GET(request: Request) {
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const { data: claimed, error } = await admin.rpc("claim_email_retries", { p_limit: 20 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let recovered = 0;
  let rescheduled = 0;
  let exhausted = 0;
  for (const row of claimed ?? []) {
    const result = await safeResendSend({
      from: row.sender_email,
      to: row.recipient_email,
      subject: row.subject,
      html: row.html_body ?? undefined,
      text: row.text_body ?? undefined,
      replyTo: Array.isArray(row.reply_to) ? row.reply_to : undefined,
      headers: row.headers ?? undefined,
      tags: Array.isArray(row.tags) ? row.tags : [],
      context: {
        bookingId: row.booking_id,
        customerId: row.customer_id,
        messageType: row.message_type,
        campaignId: row.campaign_id,
      },
      // SR-09A: this attempt belongs to the claimed original row. Do not fan out
      // a second recovery row for each retry attempt.
      recordRecovery: false,
    });

    const retryCount = Number(row.retry_count ?? 0) + 1;
    if (!result.error) {
      recovered++;
      await admin.from("email_outbound_messages").update({
        retry_status: "recovered", retry_count: retryCount, last_retry_at: new Date().toISOString(),
        next_retry_at: null, retry_locked_at: null, retry_lock_token: null, failure_reason: null,
        updated_at: new Date().toISOString(),
      }).eq("id", row.id);
      continue;
    }

    const delay = RETRY_DELAYS_MINUTES[retryCount] ?? null;
    if (delay === null || retryCount >= 4) {
      exhausted++;
      await admin.from("email_outbound_messages").update({
        retry_status: "exhausted", retry_count: retryCount, last_retry_at: new Date().toISOString(),
        next_retry_at: null, retry_locked_at: null, retry_lock_token: null,
        failure_reason: result.error.message, updated_at: new Date().toISOString(),
      }).eq("id", row.id);
    } else {
      rescheduled++;
      await admin.from("email_outbound_messages").update({
        retry_status: "queued", retry_count: retryCount, last_retry_at: new Date().toISOString(),
        next_retry_at: new Date(Date.now() + delay * 60_000).toISOString(),
        retry_locked_at: null, retry_lock_token: null, failure_reason: result.error.message,
        updated_at: new Date().toISOString(),
      }).eq("id", row.id);
    }
  }

  return NextResponse.json({ processed: claimed?.length ?? 0, recovered, rescheduled, exhausted });
}
