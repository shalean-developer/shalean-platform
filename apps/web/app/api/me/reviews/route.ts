import { NextResponse } from "next/server";
import { requireCustomerSession } from "@/lib/auth/customerBearer";
import { loadCustomerReviewsForUser } from "@/lib/customer/loadCustomerReviewsForUser";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Customer reviews list with cleaner name + booking context (no PostgREST embed). */
export async function GET(request: Request) {
  const auth = await requireCustomerSession(request);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const out = await loadCustomerReviewsForUser(admin, auth.session.userId);
  if (!out.ok) {
    return NextResponse.json({ error: out.error }, { status: out.status });
  }

  return NextResponse.json({ ok: true, reviews: out.reviews });
}
