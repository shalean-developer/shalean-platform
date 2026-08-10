import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { runIndexingSync } from "@/lib/seo/indexing/runIndexingSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error:auth.error }, { status:auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error:"Server configuration error." }, { status:503 });
  const [{ data:rows,error },{ data:runs }] = await Promise.all([
    admin.from("seo_indexing_states").select("url,path,page_group,priority,state,coverage_state,reason,last_crawl_time,inspected_at,google_canonical,user_canonical,regression_detected,action_required").eq("in_sitemap",true).order("action_required",{ascending:false}).order("priority",{ascending:true}).order("path",{ascending:true}),
    admin.from("seo_indexing_runs").select("id,started_at,completed_at,status,sitemap_urls,inspected,indexed,not_indexed,excluded,blocked,regressions,errors,message").order("started_at",{ascending:false}).limit(10),
  ]);
  if (error) return NextResponse.json({ error:error.message }, { status:500 });
  const list = rows ?? [];
  return NextResponse.json({
    summary:{ total:list.length,indexed:list.filter((r:any)=>r.state==="indexed").length,notIndexed:list.filter((r:any)=>r.state==="not_indexed").length,excluded:list.filter((r:any)=>r.state==="excluded").length,blocked:list.filter((r:any)=>r.state==="blocked").length,unknown:list.filter((r:any)=>r.state==="unknown").length,regressions:list.filter((r:any)=>r.regression_detected).length,actionRequired:list.filter((r:any)=>r.action_required).length },
    rows:list,runs:runs ?? [],
  });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error:auth.error }, { status:auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error:"Server configuration error." }, { status:503 });
  try { const result = await runIndexingSync(admin,400); return NextResponse.json(result,{ status:result.ok?200:502 }); }
  catch (error) { return NextResponse.json({ ok:false,error:error instanceof Error?error.message:"Indexing inspection failed." },{ status:500 }); }
}
