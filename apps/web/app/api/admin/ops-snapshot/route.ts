import { NextResponse } from "next/server";
import {
  computeOpsSnapshotFromRows,
  OPS_SNAPSHOT_BOOKING_SELECT,
  type OpsSnapshot,
  type OpsSnapshotRow,
} from "@/lib/admin/opsSnapshot";
import { requireAdminFromRequest } from "@/lib/admin/requireAdmin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 1000;
/** Hard ceiling so a runaway query cannot exhaust the function. */
const MAX_OPEN_ROWS = 50_000;

type OpsSnapshotResponse = OpsSnapshot & {
  scannedOpenBookings: number;
  truncated: boolean;
};

async function fetchAllOpenOpsRows(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
): Promise<{ rows: OpsSnapshotRow[]; truncated: boolean }> {
  const rows: OpsSnapshotRow[] = [];
  let from = 0;

  for (;;) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await admin
      .from("bookings")
      .select(OPS_SNAPSHOT_BOOKING_SELECT)
      .not("status", "in", "(completed,cancelled,failed,payment_expired)")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);

    if (error) throw new Error(error.message);

    const chunk = (data ?? []) as OpsSnapshotRow[];
    rows.push(...chunk);

    if (chunk.length < PAGE_SIZE) {
      return { rows, truncated: false };
    }

    from += PAGE_SIZE;
    if (from >= MAX_OPEN_ROWS) {
      return { rows, truncated: true };
    }
  }
}

/**
 * Lightweight counts for admin ops strip. Uses same in-memory rules as `computeOpsSnapshotFromRows`
 * over all open bookings (paged; excludes terminal statuses server-side).
 */
export async function GET(req: Request) {
  const auth = await requireAdminFromRequest(req);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  try {
    const { rows, truncated } = await fetchAllOpenOpsRows(admin);
    const snapshot = computeOpsSnapshotFromRows(rows);
    const body: OpsSnapshotResponse = {
      ...snapshot,
      scannedOpenBookings: rows.length,
      truncated,
    };
    return NextResponse.json(body);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load ops snapshot.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
