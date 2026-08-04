import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getEffectiveAdminScope } from "@/lib/admin/effectiveAdminScope";
import { GET as getLegacyAdminBookings } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_BRANCH_SENTINEL = "00000000-0000-0000-0000-000000000000";

function bearerToken(request: Request): string {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
}

function positiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

type BookingWire = {
  id?: string;
  team_id?: string | null;
  status?: string | null;
  date?: string | null;
  total_paid_zar?: number | null;
  amount_paid_cents?: number | null;
};

type LegacyPayload = {
  bookings?: BookingWire[];
  pagination?: Record<string, unknown>;
  statusCounts?: Record<string, number>;
  attention?: Record<string, number>;
  metrics?: Record<string, unknown>;
  failedJobs?: unknown[];
  cities?: unknown[];
  selectedCityId?: string | null;
};

function johannesburgYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function teamScopedPayload(payload: LegacyPayload, teamId: string, requestUrl: URL): LegacyPayload {
  const allRows = (payload.bookings ?? []).filter((row) => row.team_id === teamId);
  const page = positiveInt(requestUrl.searchParams.get("page"), 1);
  const pageSize = Math.min(200, positiveInt(requestUrl.searchParams.get("pageSize"), 25));
  const start = (page - 1) * pageSize;
  const rows = allRows.slice(start, start + pageSize);
  const total = allRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const today = johannesburgYmd();
  const statuses = ["confirmed", "assigned", "in_progress", "completed", "cancelled", "pending_payment", "pending"];
  const statusCounts: Record<string, number> = {
    all: total,
    completedToday: allRows.filter((row) => row.status === "completed" && row.date === today).length,
  };
  for (const status of statuses) statusCounts[status] = allRows.filter((row) => row.status === status).length;

  const todayRows = allRows.filter((row) => row.date === today);
  const revenueTodayZar = todayRows.reduce((sum, row) => {
    if (typeof row.total_paid_zar === "number") return sum + row.total_paid_zar;
    return sum + Math.round((row.amount_paid_cents ?? 0) / 100);
  }, 0);

  return {
    bookings: rows,
    pagination: {
      page: Math.min(page, totalPages),
      pageSize,
      total,
      totalPages,
      from: total === 0 ? 0 : start + 1,
      to: total === 0 ? 0 : Math.min(start + rows.length, total),
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
    statusCounts,
    attention: { unassigned: 0, slaBreaches: 0, startingSoon: 0, unassignable: 0 },
    metrics: {
      totalBookingsToday: todayRows.length,
      revenueTodayZar,
      averageOrderValueTodayZar: todayRows.length > 0 ? Math.round(revenueTodayZar / todayRows.length) : 0,
    },
    failedJobs: [],
    cities: [],
    selectedCityId: null,
  };
}

/**
 * Scope-aware adapter for the Office bookings read model.
 *
 * Owners retain company-wide access. Branch-scoped roles are pinned to their
 * assigned branch. A role with one assigned team and no branch (Supervisor)
 * receives only bookings whose `team_id` matches that team. Team-only access
 * never falls back to an all-company response.
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

  const publicClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const adminClient = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
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
  const forwardedUrl = new URL(request.url);
  forwardedUrl.pathname = "/api/admin/bookings";
  const wildcard = scope.isOwner || scope.branches.includes("*");
  const teamOnly = !wildcard && scope.branches.length === 0 && scope.teams.length > 0;

  if (teamOnly) {
    if (scope.teams.length !== 1) {
      return NextResponse.json({ error: "Exactly one team assignment is required for Supervisor booking access." }, { status: 503 });
    }
    // Fetch the complete filtered legacy read model once, then return only the
    // assigned team's rows and derived team metrics. Removing pagination here
    // avoids dropping matching team rows that occur after an unrelated page.
    forwardedUrl.searchParams.delete("page");
    forwardedUrl.searchParams.delete("pageSize");
    forwardedUrl.searchParams.delete("cityId");
  } else if (!wildcard) {
    if (scope.branches.length === 0) {
      forwardedUrl.searchParams.set("cityId", NO_BRANCH_SENTINEL);
    } else if (scope.branches.length === 1) {
      forwardedUrl.searchParams.set("cityId", scope.branches[0]);
    } else {
      return NextResponse.json({ error: "Multi-branch booking scope is not yet enabled for this read model." }, { status: 503 });
    }
  }

  const forwardedRequest = new Request(forwardedUrl, {
    method: "GET",
    headers: request.headers,
    cache: "no-store",
  });
  const response = await getLegacyAdminBookings(forwardedRequest);
  if (!teamOnly || !response.ok) return response;

  const payload = (await response.json()) as LegacyPayload;
  return NextResponse.json(teamScopedPayload(payload, scope.teams[0], requestUrl), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
