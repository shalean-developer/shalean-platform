import { NextResponse } from "next/server";
import { deleteUserPushToken, upsertUserPushToken } from "@/lib/customer/customerPushTokens";
import { resolveBookingRouteBearerAuth } from "@/lib/supabase/bookingRouteBearerAuth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Register an Expo push token for the signed-in customer.
 * Body: { token: string, platform?: string }
 * user_id always from JWT — never from body.
 */
export async function POST(request: Request) {
  const auth = await resolveBookingRouteBearerAuth(request);
  if (auth.kind === "invalid_token") {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  if (auth.kind !== "authenticated") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  delete body.user_id;
  delete body.userId;

  const token = typeof body.token === "string" ? body.token : "";
  const platform = typeof body.platform === "string" ? body.platform : null;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const result = await upsertUserPushToken(admin, {
    userId: auth.userId,
    token,
    platform,
    app: "customer",
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}

/** Unregister a push token for the signed-in customer. Body: { token: string } */
export async function DELETE(request: Request) {
  const auth = await resolveBookingRouteBearerAuth(request);
  if (auth.kind === "invalid_token") {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  if (auth.kind !== "authenticated") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : "";
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const result = await deleteUserPushToken(admin, auth.userId, token);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
