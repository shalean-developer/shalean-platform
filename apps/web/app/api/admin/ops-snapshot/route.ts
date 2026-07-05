import { NextResponse } from "next/server";
import { computeOpsSnapshotFromRows, OPS_SNAPSHOT_BOOKING_SELECT, type OpsSnapshotRow } from "@/lib/admin/opsSnapshot";
import { requireAdminFromRequest } from "@/lib/admin/requireAdmin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lightweight counts for admin ops strip. Uses same in-memory rules as `computeOpsSnapshotFromRows`
 * over recent open bookings (excludes terminal statuses server-side where possible).
 */
export async function GET(req: Request) {
  const auth = await requireAdminFromRequest(req);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data, error } = await admin
    .from("bookings")
    .select(OPS_SNAPSHOT_BOOKING_SELECT)
    .not("status", "in", "(completed,cancelled,failed)")
    .limit(3500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as OpsSnapshotRow[];
  const snapshot = computeOpsSnapshotFromRows(rows);

  return NextResponse.json(snapshot);
}
