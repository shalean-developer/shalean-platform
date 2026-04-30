import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX = 150;

/**
 * Recent `cleaner_earnings_disbursements` (ledger Paystack batches) for admin history.
 */
export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const limit = Math.min(MAX, Math.max(10, Number(new URL(request.url).searchParams.get("limit")) || 60));

  const { data: disb, error } = await admin
    .from("cleaner_earnings_disbursements")
    .select("id, cleaner_id, total_amount_cents, status, created_at, paid_at, paystack_reference, transfer_code")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = disb ?? [];
  const cleanerIds = [...new Set(rows.map((r) => String((r as { cleaner_id?: string }).cleaner_id ?? "")).filter(Boolean))];

  const { data: cleaners } =
    cleanerIds.length > 0
      ? await admin.from("cleaners").select("id, full_name").in("id", cleanerIds)
      : { data: [] as { id: string; full_name: string | null }[] };

  const nameBy = new Map<string, string>();
  for (const c of cleaners ?? []) {
    const row = c as { id?: string; full_name?: string | null };
    if (row.id) nameBy.set(String(row.id), String(row.full_name ?? "").trim() || String(row.id));
  }

  const enriched = rows.map((raw) => {
    const r = raw as {
      id: string;
      cleaner_id: string;
      total_amount_cents: number;
      status: string;
      created_at: string;
      paid_at?: string | null;
      paystack_reference?: string | null;
      transfer_code?: string | null;
    };
    return {
      ...r,
      cleaner_name: nameBy.get(r.cleaner_id) ?? r.cleaner_id,
    };
  });

  return NextResponse.json({ disbursements: enriched });
}
