import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  CUSTOMER_BOOKINGS_PAGE_DEFAULT_LIMIT,
  CUSTOMER_BOOKINGS_PAGE_MAX_LIMIT,
  loadCustomerBookingPageForUser,
} from "@/lib/customer/customerBookingPageForUser";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) {
    return NextResponse.json({ error: "Missing authorization." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anon) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const pub = createClient(supabaseUrl, anon);
  const { data: userData, error: userErr } = await pub.auth.getUser(token);
  if (userErr || !userData.user?.id) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const url = new URL(request.url);
  const out = await loadCustomerBookingPageForUser(admin, userData.user.id, {
    viewerEmail: typeof userData.user.email === "string" ? userData.user.email : null,
    cursor: url.searchParams.get("cursor"),
    limit: parsePageLimit(url),
    view: url.searchParams.get("view") === "upcoming" ? "upcoming" : "all",
  });
  if (!out.ok) {
    return NextResponse.json({ error: out.error }, { status: out.status });
  }
  return NextResponse.json({ bookings: out.bookings, pageInfo: out.pageInfo });
}
