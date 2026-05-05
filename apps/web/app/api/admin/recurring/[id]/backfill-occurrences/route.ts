import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/admin/requireAdminSession";
import { backfillRecurringOccurrencesToToday } from "@/lib/recurring/backfillRecurringOccurrencesToToday";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin: create missing occurrence rows for one **Johannesburg calendar month** (same window as
 * `generate-recurring-bookings`). Optional `?month=YYYY-MM` (e.g. repair May after June started).
 * Idempotent: existing `recurring_id` + `date` rows are skipped.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminSession(request);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!id?.trim()) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const monthYm = new URL(request.url).searchParams.get("month")?.trim();
  const result = await backfillRecurringOccurrencesToToday(
    admin,
    id.trim(),
    monthYm ? { invoiceMonthYm: monthYm } : undefined,
  );
  if (!result.ok) {
    const status =
      result.error.includes("not found") || result.error.includes("Only active")
        ? 400
        : result.error.includes("Unsupported billing")
          ? 422
          : 400;
    return NextResponse.json(
      { error: result.error, billing_type: result.billing_type, plan_status: result.status },
      { status },
    );
  }

  await logSystemEvent({
    level: "info",
    source: "admin/recurring/backfill-occurrences",
    message: "recurring_backfill_completed",
    context: {
      recurring_id: result.recurring_id,
      admin_id: auth.user.id,
      generated: result.generated,
      skipped_duplicate: result.skipped_duplicate,
      skipped_other: result.skipped_other,
      truncated: result.truncated,
      next_run_date: result.next_run_date,
      campaign_floor_ymd: result.campaign_floor_ymd,
      from_ymd: result.from_ymd,
      through_ymd: result.through_ymd,
    },
  });

  return NextResponse.json(result);
}
