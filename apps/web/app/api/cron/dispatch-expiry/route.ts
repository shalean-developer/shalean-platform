import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron/verifyCronSecret";
import { runDispatchTimeouts } from "@/lib/dispatch/runDispatchTimeouts";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "/api/cron/dispatch-expiry";

/**
 * Dispatch v2 alias cron: same engine as `/api/cron/dispatch-timeouts` (TTL expiry + reassignment queue).
 * Lets ops wire a second monitor or migrate pg_cron URLs without changing behaviour.
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
    context: { route: ROUTE, timestamp, engine: "runDispatchTimeouts" },
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

  return NextResponse.json({ ok: true, ...stats, v2Route: true });
}

export async function POST(request: Request) {
  return GET(request);
}
