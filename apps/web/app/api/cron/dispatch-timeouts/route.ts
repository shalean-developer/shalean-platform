import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron/verifyCronSecret";
import { runDispatchTimeouts } from "@/lib/dispatch/runDispatchTimeouts";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "/api/cron/dispatch-timeouts";

/**
 * Cron: `Authorization: Bearer CRON_SECRET` (Vercel) or `x-cron-secret: CRON_SECRET` (Supabase pg_net).
 * Expires pending dispatch offers past `expires_at` and runs reassignment when safe.
 */
export async function GET(request: Request) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) {
    return NextResponse.json(auth.body, { status: auth.status });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const timestamp = new Date().toISOString();
  await logSystemEvent({
    level: "info",
    source: "cron",
    message: "cron.start",
    context: { route: ROUTE, timestamp },
  });

  let stats: Awaited<ReturnType<typeof runDispatchTimeouts>>;
  try {
    stats = await runDispatchTimeouts(admin);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await reportOperationalIssue("error", ROUTE, `runDispatchTimeouts threw: ${msg}`, { timestamp });
    await logSystemEvent({
      level: "info",
      source: "cron",
      message: "cron.complete",
      context: { route: ROUTE, result: { ok: false, error: msg } },
    });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  await logSystemEvent({
    level: "info",
    source: "cron",
    message: "cron.complete",
    context: { route: ROUTE, result: { ok: true, ...stats } },
  });

  return NextResponse.json({ ok: true, ...stats });
}

export async function POST(request: Request) {
  return GET(request);
}
