import { NextResponse } from "next/server";
import { collectOfficeOpsHealthSignals } from "@/lib/admin/collectOfficeOpsHealthSignals";
import { assembleOfficeOpsHealthResponse } from "@/lib/admin/assembleOfficeOpsHealthResponse";
import { buildOfficeOpsHealthSummary } from "@/lib/admin/officeOpsHealth";
import { requireAdminFromRequest } from "@/lib/admin/requireAdmin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_SCAN_LIMIT = 500;
const MAX_SCAN_LIMIT = 5_000;

function clampScanLimit(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_SCAN_LIMIT;
  return Math.min(MAX_SCAN_LIMIT, Math.max(1, Math.round(n)));
}

function shouldIncludeAcknowledged(url: URL): boolean {
  const param = url.searchParams.get("includeAcknowledged");
  return param === "1" || param === "true";
}

export async function GET(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  const fetchedAt = new Date().toISOString();
  const url = new URL(request.url);
  const scanLimit = clampScanLimit(url.searchParams.get("scanLimit"));
  const includeAcknowledged = shouldIncludeAcknowledged(url);

  if (!admin) {
    return NextResponse.json(
      buildOfficeOpsHealthSummary({
        fetchedAt,
        productionHealth: null,
        productionHealthError: "Server configuration error.",
        dbLatencyMs: null,
        dbOk: false,
        systemErrorRows: [],
        cronErrorRows: [],
        paymentDriftRows: [],
        notificationRows: [],
        whatsappPausedUntil: null,
        notificationsQueryOk: false,
      }),
    );
  }

  const signals = await collectOfficeOpsHealthSignals(admin, scanLimit, fetchedAt);
  return NextResponse.json(
    assembleOfficeOpsHealthResponse(signals, { includeAcknowledged }),
  );
}
