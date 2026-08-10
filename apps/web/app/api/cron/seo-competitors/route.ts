import { NextResponse } from "next/server";
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
    const result = await runCompetitorSerpSync(admin, 50);
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
