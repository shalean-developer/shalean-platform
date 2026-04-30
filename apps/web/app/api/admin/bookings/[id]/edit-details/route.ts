import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  adminEditBookingDetails,
  type AdminEditBookingDetailsBody,
  type AdminEditBookingDetailsResult,
} from "@/lib/booking/adminEditBookingDetails";
import { isAdmin } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonFromEditResult(result: AdminEditBookingDetailsResult): NextResponse {
  if (result.ok) {
    return NextResponse.json({
      ok: true,
      updated: result.updated,
      new_total: result.new_total,
      ...(result.idempotent ? { idempotent: true } : {}),
      ...(result.payment_mismatch ? { payment_mismatch: true } : {}),
    });
  }
  if ("conflict" in result && result.conflict) {
    return NextResponse.json({ ok: false, conflict: true, message: result.message }, { status: 409 });
  }
  if ("error" in result) {
    const collect = "collect_additional_cents" in result ? result.collect_additional_cents : undefined;
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        ...(collect != null ? { collect_additional_cents: collect } : {}),
      },
      { status: result.status },
    );
  }
  return NextResponse.json({ ok: false, error: "Unexpected response." }, { status: 500 });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
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

  const adminUserId = typeof user.id === "string" && user.id.trim() ? user.id.trim() : "";
  if (!adminUserId) {
    return NextResponse.json({ error: "Missing admin user id." }, { status: 401 });
  }

  let body: AdminEditBookingDetailsBody;
  try {
    body = (await request.json()) as AdminEditBookingDetailsBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const idempotencyHeader = request.headers.get("idempotency-key")?.trim() ?? "";

  const result = await adminEditBookingDetails(admin, {
    bookingId,
    body,
    adminUserId,
    idempotencyKey: idempotencyHeader || null,
  });

  return jsonFromEditResult(result);
}
