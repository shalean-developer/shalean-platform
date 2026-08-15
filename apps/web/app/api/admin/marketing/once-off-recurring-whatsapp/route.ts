import { NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/admin/requireAdmin";
import { getSupabaseAdmin, supabaseAdminNotConfiguredBody } from "@/lib/supabase/admin";
import { enqueueProviderWhatsApp } from "@/lib/whatsapp/providerQueue";
import { getWhatsAppTemplateReadinessByKey } from "@/lib/whatsapp/templateReadiness";
import {
  loadOnceOffRecurringCandidates,
  ONCE_OFF_RECURRING_BOOKING_URL,
  ONCE_OFF_RECURRING_TEMPLATE_KEY,
} from "@/lib/growth/onceOffRecurringCampaign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAMPAIGN_KEY = "once-off-to-recurring-v1";

async function snapshot() {
  const admin = getSupabaseAdmin();
  if (!admin) return { error: supabaseAdminNotConfiguredBody(), status: 503 as const };
  const candidates = await loadOnceOffRecurringCandidates(admin);
  const readiness = getWhatsAppTemplateReadinessByKey(ONCE_OFF_RECURRING_TEMPLATE_KEY);
  const prefix = `campaign:${CAMPAIGN_KEY}:`;
  const { data: queued } = await admin
    .from("whatsapp_queue")
    .select("idempotency_key,status")
    .like("idempotency_key", `${prefix}%`)
    .in("status", ["pending", "processing", "sent"])
    .limit(5000);
  const sentKeys = new Set((queued ?? []).map((row) => String((row as { idempotency_key?: string }).idempotency_key ?? "")));
  const rows = candidates.map((candidate) => ({
    ...candidate,
    alreadyQueued: sentKeys.has(`${prefix}${candidate.phoneE164}`),
  }));
  return {
    admin,
    data: {
      campaignKey: CAMPAIGN_KEY,
      templateKey: ONCE_OFF_RECURRING_TEMPLATE_KEY,
      templateName: readiness?.metaTemplateName ?? ONCE_OFF_RECURRING_TEMPLATE_KEY,
      templateStatus: readiness?.approvalStatus ?? "unknown",
      sendReady: readiness?.sendReady ?? false,
      bookingUrl: ONCE_OFF_RECURRING_BOOKING_URL,
      rules: {
        completedBookings: 1,
        recurringCompleted: 0,
        minDaysSinceLastBooking: 8,
        maxDaysSinceLastBooking: 90,
      },
      totalEligible: rows.length,
      unsentEligible: rows.filter((row) => !row.alreadyQueued).length,
      candidates: rows,
    },
  };
}

export async function GET(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) return auth.response;
  try {
    const result = await snapshot();
    if ("error" in result) return NextResponse.json(result.error, { status: result.status });
    return NextResponse.json({ fetchedAt: new Date().toISOString(), ...result.data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load campaign audience" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) return auth.response;
  let body: { confirm?: string; limit?: number } = {};
  try { body = await request.json(); } catch { /* empty */ }
  if (body.confirm !== "SEND") {
    return NextResponse.json({ error: "Confirmation required. Send confirm=SEND." }, { status: 400 });
  }
  try {
    const result = await snapshot();
    if ("error" in result) return NextResponse.json(result.error, { status: result.status });
    if (!result.data.sendReady) {
      return NextResponse.json({
        error: `Template ${result.data.templateName} is not approved/ready in Shalean yet.`,
        templateStatus: result.data.templateStatus,
      }, { status: 409 });
    }

    const limit = Math.max(1, Math.min(250, Number(body.limit ?? 250)));
    const targets = result.data.candidates.filter((row) => !row.alreadyQueued).slice(0, limit);
    let queued = 0;
    const failures: Array<{ phone: string; error: string }> = [];
    for (const candidate of targets) {
      const idempotencyKey = `campaign:${CAMPAIGN_KEY}:${candidate.phoneE164}`;
      const outcome = await enqueueProviderWhatsApp({
        admin: result.admin,
        phone: candidate.phoneE164,
        type: "template",
        payload: {
          kind: "template",
          templateName: result.data.templateName,
          language: "en",
          bodyParams: [candidate.firstName, ONCE_OFF_RECURRING_BOOKING_URL],
        },
        recipientRole: "customer",
        idempotencyKey,
        context: {
          source: "marketing_campaign",
          campaign_key: CAMPAIGN_KEY,
          template_key: ONCE_OFF_RECURRING_TEMPLATE_KEY,
          recipient_role: "customer",
          last_completed_at: candidate.lastCompletedAt,
          days_since_last_booking: candidate.daysSinceLastBooking,
        },
        priority: -5,
        // Bulk campaigns must only persist rows inside this request. The worker drains them
        // afterwards so a provider slowdown cannot make a 250-recipient POST time out mid-batch.
        immediate: false,
      });
      if (outcome.id) queued += 1;
      else failures.push({ phone: candidate.phoneE164, error: outcome.error ?? "queue_failed" });
    }

    return NextResponse.json({ ok: failures.length === 0, queued, failures, remaining: Math.max(0, result.data.unsentEligible - queued) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to launch campaign" }, { status: 500 });
  }
}