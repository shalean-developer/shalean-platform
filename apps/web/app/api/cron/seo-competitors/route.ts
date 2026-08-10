import { NextResponse } from "next/server";
import { withCronLock } from "@/lib/cron/cronLock";
import { CRON_LOCK_KEYS } from "@/lib/cron/cronLockKeys";
import { verifyCronSecret } from "@/lib/cron/verifyCronSecret";
import { logCronRun } from "@/lib/logging/systemLog";
import { runCompetitorSerpSync } from "@/lib/seo/competitors/runCompetitorSerpSync";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(request: Request) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Supabase admin not configured." }, { status: 503 });

  try {
    const lockResult = await withCronLock(
      admin,
      { jobName: CRON_LOCK_KEYS.seoCompetitors, leaseSeconds: 3600 },
      () => runCompetitorSerpSync(admin, 50),
    );
    if (lockResult.skipped) {
      return NextResponse.json({ ok: true, skipped: true, reason: lockResult.reason });
    }

    const result = lockResult.ranIt;
    await logCronRun({
      jobName: "seo-competitors",
      status: result.ok ? "success" : "error",
      message: result.ok ? "Competitor SERP sync completed." : "Competitor SERP sync completed with errors.",
      context: result,
    });
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown competitor SERP sync failure.";
    await logCronRun({ jobName: "seo-competitors", status: "error", message, context: { error: message } });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) { return handle(request); }
export async function POST(request: Request) { return handle(request); }
