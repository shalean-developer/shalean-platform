import { NextResponse } from "next/server";
import { markCustomerNotificationRead } from "@/lib/customer/customerNotifications";
import { resolveBookingRouteBearerAuth } from "@/lib/supabase/bookingRouteBearerAuth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Mark one notification or all as read. Foreign ids → 404. */
export async function POST(request: Request) {
  const auth = await resolveBookingRouteBearerAuth(request);
  if (auth.kind === "invalid_token") {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  if (auth.kind !== "authenticated") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: { id?: string | null; all?: boolean };
  try {
    body = (await request.json()) as { id?: string | null; all?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const result = await markCustomerNotificationRead(admin, auth.userId, {
    id: typeof body.id === "string" ? body.id : undefined,
    all: body.all === true,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
