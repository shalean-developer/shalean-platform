import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { retryDispatchBooking } from "@/lib/booking/bookingOperations";
import type { AdminRetryDispatchHttpResult } from "@/lib/admin/performAdminRetryDispatchBooking";
import { isAdmin } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Clears terminal dispatch backoff / attempt cap side-effects and runs one auto-assign wave (soft).
 * For ops when `dispatch_status` is `failed`, `unassignable`, or `no_cleaner` on a paid pending booking.
 *
 * Idempotent under double-submit: the reset `update` requires a matching terminal `dispatch_status`,
 * so a second in-flight request after the first succeeds will update 0 rows (409) and does not corrupt state.
 */
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

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const op = await retryDispatchBooking({
    admin,
    bookingId,
    actorUserId: user.id,
    actorEmail: user.email ?? null,
  });

  if (!op.ok) {
    const inner = op.cause as AdminRetryDispatchHttpResult | undefined;
    if (inner && typeof inner === "object" && "status" in inner && "body" in inner) {
      return NextResponse.json(inner.body, { status: inner.status });
    }
    return NextResponse.json({ error: op.message }, { status: op.httpStatus ?? 500 });
  }

  return NextResponse.json(op.data, { status: 200 });
}
