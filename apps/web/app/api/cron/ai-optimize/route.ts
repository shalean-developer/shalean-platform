import { NextResponse } from "next/server";
import { logAiDecision } from "@/lib/ai/logAiDecision";
import type { SlotAdjustmentRow, SlotMetricRow } from "@/lib/ai/pricingOptimizer";
import { runPricingOptimizationPass } from "@/lib/ai/pricingOptimizer";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Hourly (Vercel cron): adjust `pricing_slot_adjustments` from `pricing_metrics` with ±10% steps, clamped [0.8, 1.2].
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

  const { data: metricsRaw, error: mErr } = await admin.from("pricing_metrics").select("*");
  if (mErr) {
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }

  const { data: adjRaw, error: aErr } = await admin.from("pricing_slot_adjustments").select("slot_time, multiplier");
  if (aErr) {
    return NextResponse.json({ error: aErr.message }, { status: 500 });
  }

  const metrics: SlotMetricRow[] = (metricsRaw ?? [])
    .map((row) => {
      const r = row as { slot_time?: string; conversion_rate?: unknown };
      const cr = Number(r.conversion_rate);
      return {
        slot_time: String(r.slot_time ?? ""),
        conversion_rate: Number.isFinite(cr) ? Math.min(1, Math.max(0, cr)) : 0.35,
      };
    })
    .filter((m) => /^\d{2}:\d{2}$/.test(m.slot_time));
  const adjustments = (adjRaw ?? []) as SlotAdjustmentRow[];

  const plan = runPricingOptimizationPass(metrics, adjustments);

  let updated = 0;
  for (const row of plan) {
    if (row.previousMultiplier === row.nextMultiplier) continue;

    const { error: upErr } = await admin
      .from("pricing_slot_adjustments")
      .update({ multiplier: row.nextMultiplier, updated_at: new Date().toISOString() })
      .eq("slot_time", row.slot_time);

    if (!upErr) updated++;
  }

  await logAiDecision("pricing_optimizer_cron", {
    slots: plan.length,
    updated,
    sample: plan.slice(0, 5),
  });

  return NextResponse.json({
    ok: true,
    evaluated: plan.length,
    rowsUpdated: updated,
  });
}

export async function GET(request: Request) {
  return POST(request);
}
