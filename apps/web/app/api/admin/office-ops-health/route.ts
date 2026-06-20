import { NextResponse } from "next/server";
import { collectOfficeOpsHealthSignals } from "@/lib/admin/collectOfficeOpsHealthSignals";
import { buildOfficeOpsHealthSummary } from "@/lib/admin/officeOpsHealth";
import { requireAdminFromRequest } from "@/lib/admin/requireAdmin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_SCAN_LIMIT = 250;

function clampScanLimit(raw: string | null): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_SCAN_LIMIT;
  return Math.min(5000, Math.max(1, Math.round(n)));
}

export async function GET(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  const fetchedAt = new Date().toISOString();
  const url = new URL(request.url);
  const scanLimit = clampScanLimit(url.searchParams.get("scanLimit"));

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
        notificationRows: [],
        whatsappPausedUntil: null,
        notificationsQueryOk: false,
      }),
    );
  }

  const signals = await collectOfficeOpsHealthSignals(admin, scanLimit, fetchedAt);
  const summary = buildOfficeOpsHealthSummary({
    fetchedAt: signals.fetchedAt,
    productionHealth: signals.productionHealth,
    productionHealthError: signals.productionHealthError,
    dbLatencyMs: signals.dbLatencyMs,
    dbOk: signals.dbOk,
    systemErrorRows: signals.systemErrorRows,
    cronErrorRows: signals.cronErrorRows,
    notificationRows: signals.notificationRows,
    whatsappPausedUntil: signals.whatsappPausedUntil,
    customerOutboundPausedUntil: signals.customerOutboundPausedUntil,
    notificationsQueryOk: signals.notificationsQueryOk,
  });

  return NextResponse.json(summary);
}
