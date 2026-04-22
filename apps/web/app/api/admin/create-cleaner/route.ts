import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { runAdminCreateCleaner } from "@/lib/cleaner/runAdminCreateCleaner";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin-only: create Auth user + cleaners row (surrogate id, `auth_user_id` link).
 * Body: { fullName, phone, password, email?, cityId?, location?, availabilityStart?, availabilityEnd?, isAvailable? }
 */
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
    error: sessionErr,
  } = await pub.auth.getUser(token);

  if (sessionErr || !user?.email) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }
  if (!isAdmin(user.email)) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  let body: {
    fullName?: string;
    phone?: string;
    password?: string;
    email?: string | null;
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

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  try {
    const created = await runAdminCreateCleaner(admin, {
      fullName: String(body.fullName ?? ""),
      phone: String(body.phone ?? ""),
      password: String(body.password ?? ""),
      email: body.email ?? null,
      cityId: body.cityId ?? null,
      location: body.location ?? null,
      availabilityStart: body.availabilityStart ?? null,
      availabilityEnd: body.availabilityEnd ?? null,
      isAvailable: body.isAvailable ?? true,
    });
    return NextResponse.json({ ok: true, cleanerId: created.cleanerId, email: created.email }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create cleaner.";
    const conflict = message.toLowerCase().includes("already");
    return NextResponse.json({ error: message }, { status: conflict ? 409 : 400 });
  }
}
