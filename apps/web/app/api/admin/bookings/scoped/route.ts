import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { applyEffectiveBranchScope } from "@/lib/admin/applyEffectiveBranchScope";
import { getEffectiveAdminScope } from "@/lib/admin/effectiveAdminScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearerToken(request: Request): string {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
}

function positiveInt(raw: string | null, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

/**
 * Phase 3B branch-scoped booking read model.
 *
 * This endpoint is intentionally read-only. It establishes the secure query
 * pattern before the larger legacy admin bookings route is migrated in smaller,
 * reviewable slices.
 */
export async function GET(request: Request) {
  const token = bearerToken(request);
  if (!token) return NextResponse.json({ error: "Missing authorization." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !serviceRole) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const publicClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error: userError } = await publicClient.auth.getUser(token);
  if (userError || !user?.id) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }

  const { scope, error: scopeError } = await getEffectiveAdminScope(adminClient, user.id);
  if (scopeError || !scope) {
    console.error("Scoped booking access resolution failed", { userId: user.id });
    return NextResponse.json({ error: "Scope resolution unavailable." }, { status: 503 });
  }
  if (!scope.permissions.includes("booking.view")) {
    return NextResponse.json({ error: "Access restricted." }, { status: 403 });
  }

  const requestUrl = new URL(request.url);
  const page = positiveInt(requestUrl.searchParams.get("page"), 1);
  const pageSize = Math.min(100, positiveInt(requestUrl.searchParams.get("pageSize"), 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = adminClient
    .from("bookings")
    .select(
      "id, booking_reference, customer_name, customer_email, service, service_slug, date, time, location, city_id, status, payment_status, cleaner_id, team_id, total_paid_zar, amount_paid_cents, created_at",
      { count: "exact" },
    );

  query = applyEffectiveBranchScope({ query, scope, column: "city_id" }) as typeof query;
  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, error, count } = await query;
  if (error) {
    console.error("Scoped bookings query failed", { userId: user.id, error: error.message });
    return NextResponse.json({ error: "Could not load bookings." }, { status: 500 });
  }

  return NextResponse.json({
    data: data ?? [],
    pagination: {
      page,
      pageSize,
      total: count ?? 0,
      totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
    },
    scope: {
      isOwner: scope.isOwner,
      branches: scope.branches,
    },
  });
}
