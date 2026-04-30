import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const statusFilter = new URL(request.url).searchParams.get("status")?.trim().toLowerCase() ?? "";
  const limit = Math.min(200, Math.max(10, Number(new URL(request.url).searchParams.get("limit")) || 80));

  let q = admin
    .from("cleaner_earnings_disputes")
    .select(
      "id, cleaner_id, booking_id, reason, status, admin_response, created_at, resolved_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (["open", "reviewing", "resolved", "rejected"].includes(statusFilter)) {
    q = q.eq("status", statusFilter);
  }

  const { data: rows, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const list = rows ?? [];
  const cleanerIds = [...new Set(list.map((r) => String((r as { cleaner_id?: string }).cleaner_id ?? "")).filter(Boolean))];
  const bookingIds = [...new Set(list.map((r) => String((r as { booking_id?: string }).booking_id ?? "")).filter(Boolean))];

  const [{ data: cleaners }, { data: bookings }] = await Promise.all([
    cleanerIds.length ? admin.from("cleaners").select("id, full_name").in("id", cleanerIds) : Promise.resolve({ data: [] }),
    bookingIds.length
      ? admin.from("bookings").select("id, date, service").in("id", bookingIds)
      : Promise.resolve({ data: [] }),
  ]);

  const nameBy = new Map<string, string>();
  for (const c of cleaners ?? []) {
    const row = c as { id?: string; full_name?: string | null };
    if (row.id) nameBy.set(String(row.id), String(row.full_name ?? "").trim() || String(row.id));
  }
  const bookingBy = new Map<string, { date: string | null; service: string | null }>();
  for (const b of bookings ?? []) {
    const row = b as { id?: string; date?: string | null; service?: string | null };
    if (row.id) bookingBy.set(String(row.id), { date: row.date ?? null, service: row.service ?? null });
  }

  const enriched = list.map((raw) => {
    const r = raw as {
      id: string;
      cleaner_id: string;
      booking_id: string;
      reason: string;
      status: string;
      admin_response?: string | null;
      created_at: string;
      resolved_at?: string | null;
    };
    return {
      ...r,
      cleaner_name: nameBy.get(r.cleaner_id) ?? r.cleaner_id,
      booking: bookingBy.get(r.booking_id) ?? null,
    };
  });

  return NextResponse.json({ disputes: enriched });
}
