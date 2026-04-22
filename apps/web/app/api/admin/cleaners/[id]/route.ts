import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeSouthAfricaPhone, southAfricaPhoneLookupVariants } from "@/lib/utils/phone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing cleaner id." }, { status: 400 });

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return NextResponse.json({ error: "Missing authorization." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

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

  // Email is updated only via POST /api/admin/update-cleaner-email (syncs auth.users + cleaners).

  let body: {
    status?: string;
    full_name?: string;
    phone?: string;
    location?: string | null;
    availability_start?: string | null;
    availability_end?: string | null;
    is_available?: boolean;
  };
  try {
    body = (await request.json()) as { status?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const updates: Record<string, unknown> = {};
  if (body.status !== undefined) {
    const status = String(body.status ?? "").trim().toLowerCase();
    const allowed = new Set(["available", "busy", "offline"]);
    if (!allowed.has(status)) return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    updates.status = status;
  }
  if (body.full_name !== undefined) {
    const fullName = String(body.full_name).trim();
    if (!fullName) return NextResponse.json({ error: "Full name is required." }, { status: 400 });
    updates.full_name = fullName;
  }
  if (body.phone !== undefined) {
    const raw = String(body.phone).trim();
    if (!raw) return NextResponse.json({ error: "Phone is required." }, { status: 400 });
    const phoneNorm = normalizeSouthAfricaPhone(raw);
    if (!phoneNorm) return NextResponse.json({ error: "Invalid South Africa phone number." }, { status: 400 });
    const variants = southAfricaPhoneLookupVariants(raw);
    const { data: dupRows, error: dupErr } = await admin
      .from("cleaners")
      .select("id")
      .in("phone", variants)
      .neq("id", id)
      .limit(1);
    if (dupErr) return NextResponse.json({ error: dupErr.message }, { status: 500 });
    if (dupRows?.length) return NextResponse.json({ error: "Phone number already exists." }, { status: 409 });
    const dupNum = await admin.from("cleaners").select("id").in("phone_number", variants).neq("id", id).limit(1);
    if (!dupNum.error && dupNum.data?.length) {
      return NextResponse.json({ error: "Phone number already exists." }, { status: 409 });
    }
    updates.phone = phoneNorm;
  }
  if (body.location !== undefined) updates.location = body.location?.trim() || null;
  if (body.availability_start !== undefined) updates.availability_start = body.availability_start || null;
  if (body.availability_end !== undefined) updates.availability_end = body.availability_end || null;
  if (body.is_available !== undefined) {
    updates.is_available = Boolean(body.is_available);
    if (body.status === undefined) {
      updates.status = body.is_available ? "available" : "offline";
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const { error } = await admin.from("cleaners").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
