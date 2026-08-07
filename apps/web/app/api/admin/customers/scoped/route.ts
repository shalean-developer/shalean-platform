import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getEffectiveAdminScope } from "@/lib/admin/effectiveAdminScope";
import { loadAdminCustomersList } from "@/lib/admin/loadAdminCustomersList";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearerToken(request: Request): string {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
}

type AdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

async function customerIdsForBranches(
  adminClient: AdminClient,
  branchIds: string[],
): Promise<Set<string>> {
  const ids = new Set<string>();
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await adminClient
      .from("bookings")
      .select("user_id")
      .in("city_id", branchIds)
      .not("user_id", "is", null)
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    const rows = data ?? [];
    for (const raw of rows) {
      const userId = String((raw as { user_id?: string | null }).user_id ?? "").trim();
      if (userId) ids.add(userId);
    }
    if (rows.length < pageSize) break;
  }

  return ids;
}

/**
 * Branch-scoped customer list for Office.
 *
 * Customer membership is derived from historical bookings. Owners and wildcard
 * branch assignments retain full access. Restricted admins see customers with
 * at least one booking in an assigned branch. A restricted admin with no branch
 * assignment fails closed to an empty customer list.
 *
 * Customer revenue is independently redacted unless the signed-in account has
 * `finance.customer_revenue.view`; customer-list access alone never grants it.
 */
export async function GET(request: Request) {
  const token = bearerToken(request);
  if (!token) return NextResponse.json({ error: "Missing authorization." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const publicClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = getSupabaseAdmin();
  if (!adminClient) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const {
    data: { user },
    error: userError,
  } = await publicClient.auth.getUser(token);
  if (userError || !user?.id) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }

  const { scope, error: scopeError } = await getEffectiveAdminScope(adminClient, user.id);
  if (scopeError || !scope) {
    console.error("Scoped customer access resolution failed", { userId: user.id });
    return NextResponse.json({ error: "Scope resolution unavailable." }, { status: 503 });
  }
  if (!scope.permissions.includes("customer.view")) {
    return NextResponse.json({ error: "Access restricted." }, { status: 403 });
  }

  try {
    const rows = await loadAdminCustomersList(adminClient);
    const wildcard = scope.isOwner || scope.branches.includes("*");
    const canViewCustomerRevenue = scope.permissions.includes("finance.customer_revenue.view");

    let scopedRows = rows;
    if (!wildcard) {
      if (scope.branches.length === 0) {
        scopedRows = [];
      } else {
        const allowedCustomerIds = await customerIdsForBranches(adminClient, scope.branches);
        scopedRows = rows.filter((customer) => allowedCustomerIds.has(customer.user_id));
      }
    }

    const customers = scopedRows.map((customer) => {
      const next = {
        ...customer,
        totalBookings: customer.total_bookings,
        totalSpendZar: canViewCustomerRevenue ? customer.total_spend_zar : undefined,
        lastBookingAt: customer.last_booking_at,
      } as Record<string, unknown>;
      if (!canViewCustomerRevenue) delete next.total_spend_zar;
      return next;
    });

    return NextResponse.json(
      {
        customers,
        scope: { isOwner: scope.isOwner, branches: scope.branches },
        capabilities: { customerRevenue: canViewCustomerRevenue },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Scoped customers query failed", { userId: user.id, error: message });
    return NextResponse.json({ error: "Could not load customers." }, { status: 500 });
  }
}
