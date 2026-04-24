import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { performAdminAssignToCleaner } from "@/lib/admin/performAdminAssignToCleaner";
import { isAdmin } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bookingId } = await ctx.params;
  if (!bookingId) {
    return NextResponse.json({ error: "Missing booking id." }, { status: 400 });
  }

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

  let body: { cleanerId?: string; force?: boolean };
  try {
    body = (await request.json()) as { cleanerId?: string; force?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const rawCleanerId = typeof body.cleanerId === "string" ? body.cleanerId.trim() : "";
  if (!rawCleanerId) {
    return NextResponse.json({ error: "cleanerId required." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const { data: cleaner, error: cErr } = await admin
    .from("cleaners")
    .select("id, status, city_id")
    .or(`id.eq.${rawCleanerId},auth_user_id.eq.${rawCleanerId}`)
    .maybeSingle();

  if (cErr || !cleaner) {
    return NextResponse.json({ error: "Cleaner not found." }, { status: 404 });
  }

  const cleanerId = String((cleaner as { id: string }).id);

  if (process.env.NODE_ENV !== "production") {
    console.log("[admin/assign] resolved cleaner", {
      bookingId,
      rawCleanerId,
      cleanerId,
      matchedBySurrogate: rawCleanerId === cleanerId,
    });
  }

  const result = await performAdminAssignToCleaner(admin, {
    bookingId,
    cleanerId,
    force: body.force === true,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.httpStatus });
  }

  return NextResponse.json({
    ok: true,
    cleanerId: result.cleanerId,
    offerId: result.offerId,
    expiresAt: result.expiresAtIso,
  });
}
