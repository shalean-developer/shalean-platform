import { NextResponse } from "next/server";
import { requireFinanceApi } from "@/lib/auth/requireFinanceApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireFinanceApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim();

  let query = admin.from("expense_vendors").select("*").order("name");
  if (search) query = query.ilike("name", `%${search}%`);

  const { data, error } = await query.limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const vendors = data ?? [];
  const vendorIds = vendors.map((v) => v.id);
  const statsByVendor = new Map<string, { count: number; total_cents: number }>();

  if (vendorIds.length > 0) {
    const { data: expenseRows } = await admin
      .from("expenses")
      .select("vendor_id, amount_cents, status")
      .in("vendor_id", vendorIds);

    for (const row of expenseRows ?? []) {
      const vid = row.vendor_id as string | null;
      if (!vid) continue;
      const stat = statsByVendor.get(vid) ?? { count: 0, total_cents: 0 };
      stat.count += 1;
      if (row.status === "approved") stat.total_cents += row.amount_cents ?? 0;
      statsByVendor.set(vid, stat);
    }
  }

  const enriched = vendors.map((v) => {
    const stat = statsByVendor.get(v.id);
    return {
      ...v,
      expense_count: stat?.count ?? 0,
      total_spent_cents: stat?.total_cents ?? 0,
    };
  });

  return NextResponse.json({ vendors: enriched });
}

export async function POST(request: Request) {
  const auth = await requireFinanceApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name is required." }, { status: 400 });

  const row = {
    name,
    contact_person: body.contact_person ? String(body.contact_person) : null,
    phone: body.phone ? String(body.phone) : null,
    email: body.email ? String(body.email) : null,
    address: body.address ? String(body.address) : null,
    notes: body.notes ? String(body.notes) : null,
  };

  const { data, error } = await admin.from("expense_vendors").insert(row).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}
