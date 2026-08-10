import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron/verifyCronSecret";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { processReviewSmsPromptQueue } from "@/lib/reviews/reviewPromptSms";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "/api/cron/review-prompts";

/**
 * Dedicated review-prompt worker. The queue processor uses compare-and-set
 * timestamps on each row, so this route is safe alongside the legacy fallback
 * invocation from retry-failed-jobs while that path is being phased out.
 */
export async function POST(request: Request) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  try {
    const result = await processReviewSmsPromptQueue(admin, { limit: 50 });
    await logSystemEvent({
      level: result.policyBlockedReason ? "info" : "info",
      source: "cron/review-prompts",
      message: result.policyBlockedReason ? "Review prompts preserved; outbound policy blocked send" : "Review prompt cron finished",
      context: { route: ROUTE, ...result },
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await reportOperationalIssue("error", "cron/review-prompts", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
