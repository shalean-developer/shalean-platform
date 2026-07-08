import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  loadReferralEmailCampaign,
  sendReferralCampaignEmail,
  processMonthlyReferralCampaign,
  REFERRAL_CAMPAIGN_ID,
} from "@/lib/referrals/referralCampaignEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const campaign = await loadReferralEmailCampaign(admin);
  const { data: sends } = await admin
    .from("email_campaign_sends")
    .select("status, sent_at, opened_at, clicked_at, bounced_at, created_at")
    .eq("campaign_id", REFERRAL_CAMPAIGN_ID)
    .order("created_at", { ascending: false })
    .limit(500);

  const rows = sends ?? [];
  const sent = rows.filter((r) => (r as { status?: string }).status === "sent").length;
  const failed = rows.filter((r) => (r as { status?: string }).status === "failed").length;
  const bounced = rows.filter((r) => (r as { status?: string }).status === "bounced").length;
  const opened = rows.filter((r) => (r as { opened_at?: string | null }).opened_at).length;
  const clicked = rows.filter((r) => (r as { clicked_at?: string | null }).clicked_at).length;

  return NextResponse.json({
    campaign,
    stats: {
      totalSends: rows.length,
      sent,
      failed,
      bounced,
      openRate: sent > 0 ? Math.round((opened / sent) * 100) : null,
      clickRate: sent > 0 ? Math.round((clicked / sent) * 100) : null,
      bounceRate: sent > 0 ? Math.round((bounced / sent) * 100) : null,
    },
    recentSends: rows.slice(0, 50),
  });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const body = (await request.json()) as {
    enabled?: boolean;
    subjectTemplate?: string;
    bodyHtmlTemplate?: string;
  };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (body.subjectTemplate) patch.subject_template = body.subjectTemplate;
  if (body.bodyHtmlTemplate) patch.body_html_template = body.bodyHtmlTemplate;

  const { error } = await admin.from("email_campaigns").update(patch).eq("id", REFERRAL_CAMPAIGN_ID);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const body = (await request.json()) as { action: "send_test" | "send_now"; testEmail?: string };

  if (body.action === "send_test") {
    const email = body.testEmail?.trim();
    if (!email) return NextResponse.json({ error: "testEmail required." }, { status: 400 });
    const result = await sendReferralCampaignEmail({
      admin,
      userId: auth.userId ?? "00000000-0000-0000-0000-000000000000",
      email,
      firstName: "Friend",
      isTest: true,
    });
    return NextResponse.json({ success: result.sent, error: result.error });
  }

  if (body.action === "send_now") {
    const result = await processMonthlyReferralCampaign(admin);
    return NextResponse.json({ success: true, ...result });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
