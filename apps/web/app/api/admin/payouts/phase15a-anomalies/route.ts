import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { fetchPhase15aPayoutAnomalies } from "@/lib/payout/phase15aAnomaliesReadModel";
import {
  PHASE15A_ANOMALIES_DEFAULT_MAX_SCAN,
  parsePhase15aCategoryParam,
  parsePhase15aClassificationParam,
} from "@/lib/payout/phase15aAnomaliesShared";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Phase 15A — read-only admin diagnostics (Week 2 surface + Week 3 classification). GET only; no writes.
 */
export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const url = new URL(request.url);
  const category = parsePhase15aCategoryParam(url.searchParams.get("category"));
  const classification = parsePhase15aClassificationParam(url.searchParams.get("classification"));

  const limitRaw = parseInt(url.searchParams.get("limit") ?? "40", 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, limitRaw)) : 40;

  const maxScanRaw = parseInt(
    url.searchParams.get("max_scan") ?? String(PHASE15A_ANOMALIES_DEFAULT_MAX_SCAN),
    10,
  );
  const maxScan = Number.isFinite(maxScanRaw)
    ? Math.min(PHASE15A_ANOMALIES_DEFAULT_MAX_SCAN, Math.max(limit, maxScanRaw))
    : PHASE15A_ANOMALIES_DEFAULT_MAX_SCAN;

  const payload = await fetchPhase15aPayoutAnomalies(admin, {
    limit,
    maxScan,
    category,
    classification,
  });

  return NextResponse.json(payload);
}
