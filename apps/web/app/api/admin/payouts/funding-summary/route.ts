import { NextResponse } from "next/server";
import { requireAdminPermissionFromRequest } from "@/lib/admin/requirePermission";
import { loadCleanerPayoutBatchItems } from "@/lib/payout/loadCleanerPayoutBatchItems";
import { loadCleanerPayoutFunding } from "@/lib/payout/payoutFunding";
import { presentMonthlyPayoutLifecycle } from "@/lib/payout/payoutLifecycle";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminPermissionFromRequest(request, "payout.view");
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const url = new URL(request.url);
  const payoutId = url.searchParams.get("payoutId")?.trim();
  const now = new Date();

  let query = admin
    .from("cleaner_payouts")
    .select("id, cleaner_id, status, total_amount_cents, period_start, period_end")
    .in("status", ["pending", "frozen", "approved"])
    .order("period_start", { ascending: false });
  if (payoutId) query = query.eq("id", payoutId);

  const { data: payouts, error } = await query.limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = [] as Array<Record<string, unknown>>;
  let totalLiabilityCents = 0;
  let totalFundedCents = 0;
  let totalFundingGapCents = 0;

  for (const raw of payouts ?? []) {
    const payout = raw as {
      id: string;
      cleaner_id: string | null;
      status: string | null;
      total_amount_cents: number | null;
      period_start: string | null;
      period_end: string | null;
    };
    const loaded = await loadCleanerPayoutBatchItems(admin, payout.id);
    if (loaded.error) return NextResponse.json({ error: loaded.error }, { status: 500 });
    const funding = await loadCleanerPayoutFunding(admin, payout.id, loaded.items);
    if (funding.error || !funding.summary) {
      return NextResponse.json({ error: funding.error ?? "Could not verify payout funding." }, { status: 500 });
    }

    totalLiabilityCents += funding.summary.liabilityCents;
    totalFundedCents += funding.summary.fundedCents;
    totalFundingGapCents += funding.summary.fundingGapCents;
    const lifecycle = presentMonthlyPayoutLifecycle({
      periodEnd: payout.period_end ?? "",
      status: payout.status,
      fundingGapCents: funding.summary.fundingGapCents,
      now,
    });
    rows.push({
      ...payout,
      ...funding.summary,
      fullyFunded: funding.summary.fundingGapCents === 0,
      lifecycle,
    });
  }

  return NextResponse.json({
    asOf: now.toISOString(),
    policy: {
      payoutFrequency: "monthly",
      openMonthEarningsArePayable: false,
      approvalRequiresClosedMonth: true,
      approvalRequiresFullFunding: true,
    },
    totals: {
      liabilityCents: totalLiabilityCents,
      fundedCents: totalFundedCents,
      fundingGapCents: totalFundingGapCents,
      fullyFunded: totalFundingGapCents === 0,
      payoutCount: rows.length,
      unfundedPayoutCount: rows.filter((row) => Number(row.fundingGapCents ?? 0) > 0).length,
      payableNowCount: rows.filter((row) => Boolean((row.lifecycle as { payableNow?: boolean } | undefined)?.payableNow)).length,
    },
    payouts: rows,
  });
}
