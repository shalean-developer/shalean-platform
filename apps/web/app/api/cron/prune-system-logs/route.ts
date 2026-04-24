import { NextResponse } from "next/server";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_RETENTION_DAYS = 30;

/**
 * Vercel Cron: `Authorization: Bearer CRON_SECRET`.
 * Prunes `system_logs` older than `SYSTEM_LOG_RETENTION_DAYS` (default 30, max 365) via `prune_system_logs`.
 *
 * Suggested schedule: weekly — POST /api/cron/prune-system-logs
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 503 });
  }

  const envDays = Number(process.env.SYSTEM_LOG_RETENTION_DAYS ?? DEFAULT_RETENTION_DAYS);
  const retentionDays =
    Number.isFinite(envDays) && envDays > 0 ? Math.min(365, Math.max(1, Math.round(envDays))) : DEFAULT_RETENTION_DAYS;

  const { data, error } = await admin.rpc("prune_system_logs", { p_retention_days: retentionDays });
  if (error) {
    await reportOperationalIssue("error", "cron/prune-system-logs", error.message, { retentionDays });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const deleted = typeof data === "number" ? data : Number(data ?? 0);

  await logSystemEvent({
    level: "info",
    source: "cron/prune-system-logs",
    message: `Pruned system_logs older than ${retentionDays}d`,
    context: { deleted, retentionDays },
  });

  return NextResponse.json({ ok: true, deleted, retentionDays });
}

export async function GET(request: Request) {
  return POST(request);
}
