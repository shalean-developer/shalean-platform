import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvCell(value: unknown): string {
  const s = String(value ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing payout id." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data: payout, error: payoutErr } = await admin
    .from("cleaner_payouts")
    .select("id, cleaner_id, total_amount_cents, status, period_start, period_end")
    .eq("id", id)
    .maybeSingle();
  if (payoutErr) return NextResponse.json({ error: payoutErr.message }, { status: 500 });
  if (!payout) return NextResponse.json({ error: "Payout not found." }, { status: 404 });

  const p = payout as {
    id: string;
    cleaner_id: string;
    total_amount_cents: number;
    period_start: string;
    period_end: string;
  };
  const { data: cleaner } = await admin
    .from("cleaners")
    .select("id, full_name")
    .eq("id", p.cleaner_id)
    .maybeSingle();

  const amountZar = Math.round(Number(p.total_amount_cents ?? 0) / 100);
  const cleanerName = (cleaner as { full_name?: string | null } | null)?.full_name ?? p.cleaner_id;
  const reference = `PAYOUT-${p.period_start}-${p.period_end}-${String(p.id).slice(0, 8)}`;
  const csv = [
    ["Cleaner", "Amount", "Bank", "Reference"].map(csvCell).join(","),
    [cleanerName, amountZar, "", reference].map(csvCell).join(","),
  ].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payout-${p.id}.csv"`,
    },
  });
}
