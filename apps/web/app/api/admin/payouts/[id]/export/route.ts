import { loadCleanerPaymentIdentities } from "@/lib/payout/loadCleanerPaymentIdentities";
import { cleanerPaymentReference } from "@/lib/payout/cleanerPaymentReference";
import { isProcessableClosedPayoutPeriod } from "@/lib/payout/payoutProcessingCutoff";
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
    status: string;
    period_start: string;
    period_end: string;
  };
  if (!isProcessableClosedPayoutPeriod(p.period_start, p.period_end) || p.status !== "approved") {
    return NextResponse.json({ error: "Bank instructions require a closed, approved monthly payout." }, { status: 409 });
  }
  let identity: { name: string; paymentId: string };
  let reference: string;
  try {
    identity = (await loadCleanerPaymentIdentities(admin, [p.cleaner_id])).get(p.cleaner_id)!;
    reference = cleanerPaymentReference(identity.paymentId, p.period_start.slice(0, 7));
  } catch {
    return NextResponse.json({ error: "Cleaner payment identity could not be verified." }, { status: 503 });
  }
  const amountZar = (Number(p.total_amount_cents) / 100).toFixed(2);
  const csv = [
    ["Cleaner", "Amount", "Bank", "Reference", "CleanerPaymentID"].map(csvCell).join(","),
    [identity.name, amountZar, "", reference, identity.paymentId].map(csvCell).join(","),
  ].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payout-${p.id}.csv"`,
    },
  });
}
