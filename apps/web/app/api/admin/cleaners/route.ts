import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { runAdminCreateCleaner } from "@/lib/cleaner/runAdminCreateCleaner";
import { isUnknownColumnError } from "@/lib/cleaner/cleanerMeDb";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) {
    return NextResponse.json({ error: "Missing authorization." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const pub = createClient(url, anon);
  const {
    data: { user },
  } = await pub.auth.getUser(token);
  if (!user?.email || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const search = new URL(request.url).searchParams.get("search")?.trim() ?? "";
  const escaped = search.replace(/%/g, "\\%").replace(/,/g, "");

  const selectWithWeekdays = `
      id,
      full_name,
      phone,
      auth_user_id,
      rating,
      jobs_completed,
      is_available,
      home_lat,
      home_lng,
      email,
      status,
      city_id,
      location,
      availability_start,
      availability_end,
      availability_weekdays
    `;
  const selectBase = `
      id,
      full_name,
      phone,
      auth_user_id,
      rating,
      jobs_completed,
      is_available,
      home_lat,
      home_lng,
      email,
      status,
      city_id,
      location,
      availability_start,
      availability_end
    `;

  const build = (columns: string) => {
    let q = admin.from("cleaners").select(columns).order("full_name", { ascending: true });
    if (escaped.length > 0) {
      q = q.or(`full_name.ilike.%${escaped}%,phone.ilike.%${escaped}%`);
    }
    return q;
  };

  let { data, error } = await build(selectWithWeekdays);
  if (error && isUnknownColumnError(error, "availability_weekdays")) {
    const r2 = await build(selectBase);
    data = r2.data;
    error = r2.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ cleaners: data ?? [] });
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) {
    return NextResponse.json({ error: "Missing authorization." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const pub = createClient(url, anon);
  const {
    data: { user },
  } = await pub.auth.getUser(token);
  if (!user?.email || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  let body: {
    fullName?: string;
    phone?: string;
    email?: string | null;
    password?: string;
    cityId?: string | null;
    location?: string | null;
    availabilityStart?: string | null;
    availabilityEnd?: string | null;
    isAvailable?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const fullName = String(body.fullName ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const password = String(body.password ?? "");
  const email = (body.email ?? "").toString().trim() || null;
  const cityId = body.cityId?.trim() || null;
  const location = body.location?.trim() || null;
  const availabilityStart = body.availabilityStart?.trim() || null;
  const availabilityEnd = body.availabilityEnd?.trim() || null;
  const isAvailable = body.isAvailable ?? true;

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  try {
    const created = await runAdminCreateCleaner(admin, {
      fullName,
      phone,
      password,
      email,
      cityId,
      location,
      availabilityStart,
      availabilityEnd,
      isAvailable,
    });
    return NextResponse.json({ ok: true, cleanerId: created.cleanerId, email: created.email }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create cleaner.";
    const conflict = message.toLowerCase().includes("already");
    return NextResponse.json({ error: message }, { status: conflict ? 409 : 400 });
  }
}
