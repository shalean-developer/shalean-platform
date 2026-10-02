import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { loadSalesFollowUpQueue } from "@/lib/salesDocument/loadSalesFollowUpQueue";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  try {
    const rows = await loadSalesFollowUpQueue(admin);
    const counts = rows.reduce(
      (acc, row) => {
        acc.total += 1;
        acc[row.kind] += 1;
        return acc;
      },
      {
        total: 0,
        stale_request: 0,
        sent_unviewed: 0,
        viewed_no_response: 0,
        overdue_follow_up: 0,
      },
    );

    return NextResponse.json(
      { rows, counts },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "sales_follow_up_queue_failed" },
      { status: 500 },
    );
  }
}
