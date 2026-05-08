import { NextResponse } from "next/server";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { getSouthAfricanBanks } from "@/lib/paystack/getSouthAfricanBanks";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Paystack ZA bank catalogue for cleaner payout onboarding (server-only; no secrets exposed).
 * Query: `?refresh=1` forces refresh past TTL (still honors stale-if-error inside helper).
 */
export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) {
    return NextResponse.json({ error: session.error ?? "Unauthorized." }, { status: session.status ?? 401 });
  }

  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "1" || url.searchParams.get("refresh") === "true";

  const result = await getSouthAfricanBanks({ forceRefresh });

  return NextResponse.json({
    banks: result.banks,
    meta: {
      source: result.source,
      paystackOk: result.paystackOk,
      fetchedAtMs: result.fetchedAtMs,
      cacheHit: result.cacheHit,
      duplicateCodesDropped: result.duplicateCodesDropped,
      inactiveFiltered: result.inactiveFiltered,
    },
  });
}
