import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { runStructuredDataAudit } from "@/lib/seo/structured-data/auditStructuredData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  const { data, error } = await admin.from("seo_structured_data_audits")
    .select("url,path,page_group,http_status,json_ld_count,schema_types,required_types,missing_types,errors,warnings,status,checked_at")
    .order("status", { ascending: true })
    .order("checked_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = data ?? [];
  return NextResponse.json({
    summary: {
      audited: rows.length,
      valid: rows.filter((r) => r.status === "valid").length,
      warnings: rows.filter((r) => r.status === "warning").length,
      errors: rows.filter((r) => r.status === "error").length,
      unknown: rows.filter((r) => r.status === "unknown").length,
      needsAction: rows.filter((r) => r.status === "error" || (r.missing_types?.length ?? 0) > 0).length,
      retryRequired: rows.filter((r) => r.status === "unknown").length,
      withJsonLd: rows.filter((r) => r.json_ld_count > 0).length,
    },
    rows,
  });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  try {
    const body = await request.json().catch(() => ({})) as { limit?: number };
    const result = await runStructuredDataAudit(admin, body.limit ?? 220);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Structured data audit failed." }, { status: 500 });
  }
}
