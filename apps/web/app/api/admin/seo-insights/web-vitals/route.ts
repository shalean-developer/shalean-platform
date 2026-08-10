import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { runCoreWebVitalsSync } from "@/lib/seo/performance/runCoreWebVitalsSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  const { data, error } = await admin.from("seo_web_vitals_snapshots")
    .select("url,path,page_group,priority,device,measured_at,performance_score,field_lcp_ms,field_inp_ms,field_cls,field_source,lab_lcp_ms,lab_cls,lab_tbt_ms,status,regression_detected,regression_reason")
    .order("measured_at", { ascending: false }).limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const latest = new Map<string, any>();
  for (const row of data ?? []) { const key = `${row.path}:${row.device}`; if (!latest.has(key)) latest.set(key,row); }
  const rows = [...latest.values()];
  return NextResponse.json({
    summary: {
      measurements: rows.length,
      good: rows.filter(r=>r.status==="good").length,
      needsImprovement: rows.filter(r=>r.status==="needs_improvement").length,
      poor: rows.filter(r=>r.status==="poor").length,
      unknown: rows.filter(r=>r.status==="unknown").length,
      regressions: rows.filter(r=>r.regression_detected).length,
    },
    rows,
  });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  try { const result = await runCoreWebVitalsSync(admin,20); return NextResponse.json(result,{status:result.ok?200:207}); }
  catch (error) { return NextResponse.json({ ok:false,error:error instanceof Error?error.message:"Web Vitals sync failed." },{status:500}); }
}
