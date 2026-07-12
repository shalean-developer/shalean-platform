import { NextResponse } from "next/server";
import { listCustomerNotifications } from "@/lib/customer/customerNotifications";
import { resolveBookingRouteBearerAuth } from "@/lib/supabase/bookingRouteBearerAuth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** In-app notification inbox for the signed-in customer. */
export async function GET(request: Request) {
  const auth = await resolveBookingRouteBearerAuth(request);
  if (auth.kind === "invalid_token") {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  if (auth.kind !== "authenticated") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const limitRaw = Number(searchParams.get("limit") ?? "100");
  const limit = Number.isFinite(limitRaw) ? limitRaw : 100;

  const loaded = await listCustomerNotifications(admin, auth.userId, limit);
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: 500 });

  const unreadCount = loaded.notifications.filter((n) => !n.read_at).length;
  return NextResponse.json({ notifications: loaded.notifications, unreadCount });
}
