import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { normalizeOfficePayoutPeriodRange } from "@/lib/admin/payouts/officePayoutPeriodReport";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { recalculateCleanerEarningsBatch } from "@/lib/payout/recalculateCleanerEarningsBatch";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  from?: string;
  to?: string;
  bookingId?: string;
  limit?: number;
  dryRun?: boolean;
  skipReset?: boolean;
  skipAlreadyV3?: boolean;
};

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    body = {};
  }

  const url = new URL(request.url);
  const { from, to } = normalizeOfficePayoutPeriodRange(
    body.from ?? url.searchParams.get("from"),
    body.to ?? url.searchParams.get("to"),
  );

  const dryRun = body.dryRun === true || url.searchParams.get("dryRun") === "true";
  const limitRaw = body.limit ?? Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : null;

  try {
    const result = await recalculateCleanerEarningsBatch({
      admin,
      from,
      to,
      bookingId: body.bookingId ?? url.searchParams.get("bookingId"),
      limit,
      dryRun,
      skipReset: body.skipReset === true,
      skipAlreadyV3: body.skipAlreadyV3 === true,
      actorUserId: auth.userId,
      logSource: "api/admin/payouts/recalculate-earnings",
    });

    void logSystemEvent({
      level: result.ok ? "info" : "warn",
      source: "api/admin/payouts/recalculate-earnings",
      message: dryRun ? "cleaner_earnings_recalc_dry_run" : "cleaner_earnings_recalc_complete",
      context: {
        range: { from, to },
        actor: auth.userId,
        ...result,
        changed: result.changed.length > 50 ? { count: result.changed.length } : result.changed,
      },
    });

    return NextResponse.json({
      range: { from, to },
      ...result,
      changed: result.changed.slice(0, 100),
      changedTruncated: result.changed.length > 100,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to recalculate cleaner earnings.";
    console.error("[recalculate-earnings]", message, e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
