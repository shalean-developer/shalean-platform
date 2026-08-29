import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { claimCustomerBookingOwnership } from "@/lib/customer/claimCustomerBookingOwnership";
import {
  CUSTOMER_BOOKINGS_PAGE_DEFAULT_LIMIT,
  CUSTOMER_BOOKINGS_PAGE_MAX_LIMIT,
  loadCustomerBookingPageForUser,
} from "@/lib/customer/customerBookingPageForUser";
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

function parsePageLimit(url: URL): number {
  const raw = url.searchParams.get("limit");
  if (!raw) return CUSTOMER_BOOKINGS_PAGE_DEFAULT_LIMIT;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) return CUSTOMER_BOOKINGS_PAGE_DEFAULT_LIMIT;
  return Math.min(parsed, CUSTOMER_BOOKINGS_PAGE_MAX_LIMIT);
}

/**
 * Canonical customer bookings list. The response is cursor-paged so account
 * consumers can progressively load older bookings without an unbounded query.
 */
export async function GET(request: Request) {
  const auth = await authenticateCustomer(request);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const url = new URL(request.url);
  const out = await loadCustomerBookingPageForUser(admin, auth.user.id, {
    viewerEmail: auth.user.email,
    cursor: url.searchParams.get("cursor"),
    limit: parsePageLimit(url),
  });
  if (!out.ok) {
    return NextResponse.json({ error: out.error }, { status: out.status });
  }
  return NextResponse.json({ bookings: out.bookings, pageInfo: out.pageInfo });
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
