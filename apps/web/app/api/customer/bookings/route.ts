import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  loadCustomerBookingRowsForUser,
  type CustomerBookingsScope,
} from "@/lib/customer/customerBookingsForUser";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_SCOPES = new Set<CustomerBookingsScope>(["all", "upcoming", "past"]);

function positiveInteger(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/**
 * Canonical customer bookings list: stable JSON shape for apps (vs direct Supabase reads).
 *
 * Backward compatibility: without `scope`, this returns the legacy unpaged list.
 * The account bookings page uses `scope=upcoming|past&page=...&pageSize=...` so only
 * the requested rows are loaded and enriched server-side.
 */
export async function GET(request: Request) {
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
  const { data: userData, error: userErr } = await pub.auth.getUser(token);
  if (userErr || !userData.user?.id) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const requestUrl = new URL(request.url);
  const scopeRaw = requestUrl.searchParams.get("scope");
  const scope = scopeRaw && VALID_SCOPES.has(scopeRaw as CustomerBookingsScope)
    ? (scopeRaw as CustomerBookingsScope)
    : undefined;

  if (scopeRaw && !scope) {
    return NextResponse.json({ error: "Invalid bookings scope." }, { status: 400 });
  }

  const out = await loadCustomerBookingRowsForUser(admin, userData.user.id, {
    viewerEmail: typeof userData.user.email === "string" ? userData.user.email : null,
    scope,
    page: positiveInteger(requestUrl.searchParams.get("page")),
    pageSize: positiveInteger(requestUrl.searchParams.get("pageSize")),
  });
  if (!out.ok) {
    return NextResponse.json({ error: out.error }, { status: out.status });
  }
  return NextResponse.json({ bookings: out.bookings, pagination: out.pagination ?? null });
}
