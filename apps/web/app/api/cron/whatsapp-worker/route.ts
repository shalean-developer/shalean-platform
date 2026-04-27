import { NextResponse } from "next/server";
import { processWhatsAppPendingBatch } from "@/lib/whatsapp/queue";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vercel Cron: `Authorization: Bearer CRON_SECRET`.
 * Suggested schedule: every 15–30 seconds (or up to 1 min) — POST /api/cron/whatsapp-worker
 * Optional: `?metrics=1` attaches {@link getWhatsAppQueueStatusCounts} (metrics RPC + fallback).
 *
 * Drains `whatsapp_queue` pending rows (Meta Cloud API outbound).
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

  try {
    const sp = new URL(request.url).searchParams;
    const limitRaw = Number(sp.get("limit") ?? "15");
    const limit = Number.isFinite(limitRaw) ? limitRaw : 15;
    const includeQueueMetrics = sp.get("metrics") === "1";
    const result = await processWhatsAppPendingBatch({ admin, limit, includeQueueMetrics });
    await logSystemEvent({
      level: "info",
      source: "cron/whatsapp-worker",
      message: `Processed ${result.processed} queue job(s)`,
      context: result,
    });
    return NextResponse.json({
      ok: true,
      processed: result.processed,
      succeeded: result.ok,
      failed: result.failed,
      queue_metrics: result.queue_metrics,
      worker_meta: result.worker_meta,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
