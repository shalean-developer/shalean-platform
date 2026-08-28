import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { claimCustomerBookingOwnership } from "@/lib/customer/claimCustomerBookingOwnership";
import { loadCustomerBookingRowsForUser } from "@/lib/customer/customerBookingsForUser";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AuthenticatedCustomer = { id: string; email: string | null };

async function authenticateCustomer(request: Request): Promise<
  | { ok: true; user: AuthenticatedCustomer }
  | { ok: false; response: NextResponse }
> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: "Missing authorization." }, { status: 401 }) };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return { ok: false, response: NextResponse.json({ error: "Server configuration error." }, { status: 503 }) };
  }

  const pub = createClient(url, anon);
  const { data: userData, error: userErr } = await pub.auth.getUser(token);
  if (userErr || !userData.user?.id) {
    return { ok: false, response: NextResponse.json({ error: "Invalid or expired session." }, { status: 401 }) };
  }

  return {
    ok: true,
    user: {
      id: userData.user.id,
      email: typeof userData.user.email === "string" ? userData.user.email : null,
    },
  };
}

/**
 * Canonical customer bookings list: stable JSON shape for apps (vs direct Supabase reads).
 */
export async function GET(request: Request) {
  const auth = await authenticateCustomer(request);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const out = await loadCustomerBookingRowsForUser(admin, auth.user.id, {
    viewerEmail: auth.user.email,
  });
  if (!out.ok) {
    return NextResponse.json({ error: out.error }, { status: out.status });
  }
  return NextResponse.json({ bookings: out.bookings });
}

/**
 * Explicit compatibility repair for legacy email-only bookings.
 * Rows already owned by another account are never reassigned.
 */
export async function POST(request: Request) {
  const auth = await authenticateCustomer(request);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const out = await claimCustomerBookingOwnership(admin, auth.user.id, auth.user.email);
  if (!out.ok) {
    return NextResponse.json({ error: out.error }, { status: out.status });
  }
  return NextResponse.json({ ok: true, claimed: out.claimed });
}
