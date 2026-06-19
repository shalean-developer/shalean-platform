import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { adminDirectAssignCleanerToBooking } from "@/lib/booking/bookingOperations";
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

  const op = await adminDirectAssignCleanerToBooking({
    admin,
    bookingId,
    cleanerId,
    force: body.force === true,
  });

  if (!op.ok) {
    const status = typeof op.httpStatus === "number" ? op.httpStatus : 400;
    const payload =
      op.cause && typeof op.cause === "object" && !Array.isArray(op.cause) && "error" in op.cause
        ? (op.cause as { error: string; warnings?: unknown })
        : { error: op.message };
    return NextResponse.json(payload, { status });
  }

  const data = op.data;
  if (!data) {
    return NextResponse.json({ error: "Direct assign did not return a result." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    cleanerId: data.cleanerId,
    direct: true,
    ...(data.alreadyAssigned ? { alreadyAssigned: true } : {}),
    ...(data.warnings && data.warnings.length > 0 ? { warnings: data.warnings } : {}),
  });
}
