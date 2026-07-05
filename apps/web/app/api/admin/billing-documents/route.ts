import { NextResponse } from "next/server";

import { loadAdminBillingDocuments, type AdminBillingDocumentKind } from "@/lib/admin/billing/loadAdminBillingDocuments";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = new Set<AdminBillingDocumentKind | "all" | "missing_zoho">([
  "all",
  "missing_zoho",
  "quote",
  "sales_invoice",
  "booking_invoice",
  "monthly_invoice",
]);

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const kindRaw = searchParams.get("kind") ?? "all";
  const kind = KINDS.has(kindRaw as AdminBillingDocumentKind | "all" | "missing_zoho")
    ? (kindRaw as AdminBillingDocumentKind | "all" | "missing_zoho")
    : "all";

  const payload = await loadAdminBillingDocuments(admin, { q, kind });
  return NextResponse.json(payload);
}
