import { NextResponse } from "next/server";

import { bulkDeleteAdminCustomerAccounts } from "@/lib/admin/adminCustomerDetail";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const userIds = Array.isArray(raw.user_ids)
    ? raw.user_ids.filter((id): id is string => typeof id === "string")
    : [];

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const result = await bulkDeleteAdminCustomerAccounts(admin, userIds);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    deleted: result.result.deleted,
    failed: result.result.failed,
  });
}
