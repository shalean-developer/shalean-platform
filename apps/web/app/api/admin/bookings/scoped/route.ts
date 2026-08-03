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

/**
 * Phase 3B branch-scoped adapter for the real Office bookings read model.
 *
 * The legacy bookings endpoint owns the complete filtering, pagination,
 * metrics and response shape used by `/office/bookings`. This adapter resolves
 * the signed-in admin's effective branch scope first, then forwards the request
 * to that endpoint with an enforced city filter.
 *
 * Owner / wildcard scope remains unfiltered. A restricted admin with exactly
 * one branch is pinned to that branch, regardless of any cityId supplied by the
 * browser. No branch assignment fails closed by using a UUID that cannot match
 * an operational city. Multi-branch support remains explicit rather than
 * silently widening access.
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

  const {
    data: { user },
    error: userError,
  } = await publicClient.auth.getUser(token);
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

  const forwardedUrl = new URL(request.url);
  forwardedUrl.pathname = "/api/admin/bookings";

  const wildcard = scope.isOwner || scope.branches.includes("*");
  if (!wildcard) {
    if (scope.branches.length === 0) {
      forwardedUrl.searchParams.set("cityId", NO_BRANCH_SENTINEL);
    } else if (scope.branches.length === 1) {
      forwardedUrl.searchParams.set("cityId", scope.branches[0]);
    } else {
      return NextResponse.json(
        {
          error:
            "Multi-branch booking scope is not yet enabled for this read model. Assign one branch or use the Owner role.",
        },
        { status: 503 },
      );
    }
  }

  const forwardedRequest = new Request(forwardedUrl, {
    method: "GET",
    headers: request.headers,
    cache: "no-store",
  });

  return getLegacyAdminBookings(forwardedRequest);
}
