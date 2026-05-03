import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { normalizeCleanerAvailabilityWeekdays } from "@/lib/cleaner/availabilityWeekdays";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return NextResponse.json({ error: "Missing authorization." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const pub = createClient(url, anon);
  const {
    data: { user },
    error: userErr,
  } = await pub.auth.getUser(token);
  if (userErr || !user?.email) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }
  if (!isAdmin(user.email)) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data: rows, error } = await admin
    .from("cleaner_change_requests")
    .select("id, cleaner_id, requested_locations, requested_days, note, status, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = Array.isArray(rows) ? rows : [];
  const cleanerIds = [...new Set(list.map((r) => String((r as { cleaner_id: string }).cleaner_id)))];

  const cleanerMap = new Map<
    string,
    { full_name: string | null; location: string | null; availability_weekdays: string[] }
  >();
  if (cleanerIds.length > 0) {
    const { data: cleaners, error: cErr } = await admin
      .from("cleaners")
      .select("id, full_name, location, availability_weekdays")
      .in("id", cleanerIds);
    if (cErr) {
      return NextResponse.json({ error: cErr.message }, { status: 500 });
    }
    for (const c of cleaners ?? []) {
      const row = c as {
        id: string;
        full_name?: string | null;
        location?: string | null;
        availability_weekdays?: string[] | null;
      };
      cleanerMap.set(String(row.id), {
        full_name: row.full_name ?? null,
        location: row.location ?? null,
        availability_weekdays: normalizeCleanerAvailabilityWeekdays(row.availability_weekdays),
      });
    }
  }

  const requests = list.map((r) => {
    const row = r as {
      id: string;
      cleaner_id: string;
      requested_locations: string[] | null;
      requested_days: string[] | null;
      note: string | null;
      status: string;
      created_at: string;
    };
    const c = cleanerMap.get(row.cleaner_id);
    return {
      id: row.id,
      cleaner_id: row.cleaner_id,
      cleaner_name: c?.full_name?.trim() || "—",
      current_location: (c?.location ?? "").trim() || "—",
      current_days: c?.availability_weekdays ?? [],
      requested_locations: Array.isArray(row.requested_locations) ? row.requested_locations : [],
      requested_days: normalizeCleanerAvailabilityWeekdays(row.requested_days),
      note: row.note,
      created_at: row.created_at,
      status: row.status,
    };
  });

  return NextResponse.json({ requests });
}
