import { NextResponse } from "next/server";
import { getPayoutDisbursementRunDetail } from "@/lib/admin/payoutDisbursementRuns";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing run id." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let detail: Awaited<ReturnType<typeof getPayoutDisbursementRunDetail>>;
  try {
    detail = await getPayoutDisbursementRunDetail(admin, id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: msg === "Run not found." ? 404 : 500 });
  }

  const header = [
    "payout_id",
    "cleaner_id",
    "cleaner_name",
    "amount_cents",
    "amount_zar_whole",
    "batch_status",
    "paystack_payment_status",
    "paystack_transfer_ref",
    "bank_code",
    "account_masked",
    "period_start",
    "period_end",
  ].join(",");

  const lines = detail.payouts.map((p) =>
    [
      csvCell(p.id),
      csvCell(p.cleaner_id),
      csvCell(p.cleaner_name),
      csvCell(p.total_amount_cents),
      csvCell(Math.round(p.total_amount_cents / 100)),
      csvCell(p.status),
      csvCell(p.payment_status),
      csvCell(p.payment_reference),
      csvCell(p.bank_code),
      csvCell(p.account_masked),
      csvCell(p.period_start),
      csvCell(p.period_end),
    ].join(","),
  );

  const csv = [header, ...lines].join("\r\n");
  const filename = `disbursement-run-${id.slice(0, 8)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
