import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BlogPost = { id:string; slug:string; title:string; primary_keyword:string|null };
type GscRow = { page_url:string; clicks:number; impressions:number; avg_position:number|null; prev_clicks:number; prev_impressions:number; prev_avg_position:number|null };
type RefreshRow = {
  id:string; blog_post_id:string; due_date:string|null; owner_email:string|null; editor_email:string|null; status:"queued"|"in_progress"|"completed"|"cancelled";
  reason_codes:string[]; notes:string|null; baseline_clicks:number|null; baseline_impressions:number|null; baseline_position:number|null;
  completed_clicks:number|null; completed_impressions:number|null; completed_position:number|null; baseline_captured_at:string|null; completed_at:string|null; verification_due_at:string|null; verified_at:string|null;
};

function slugFromUrl(value:string){ try { const p=new URL(value).pathname.replace(/\/$/,""); const m=p.match(/^\/blog\/([^/]+)$/); return m?decodeURIComponent(m[1]):null; } catch { return null; } }
function declined(g:GscRow|null){ if(!g||g.prev_impressions<20) return [] as string[]; const reasons:string[]=[]; if(g.clicks<g.prev_clicks*0.7) reasons.push("declining_clicks"); if(g.impressions<g.prev_impressions*0.7) reasons.push("declining_impressions"); if(g.avg_position!=null&&g.prev_avg_position!=null&&g.avg_position-g.prev_avg_position>=3) reasons.push("ranking_decline"); return reasons; }

export async function GET(request:Request){
  const auth=await requireAdminApi(request); if(!auth.ok) return NextResponse.json({error:auth.error},{status:auth.status});
  const admin=getSupabaseAdmin(); if(!admin) return NextResponse.json({error:"Server configuration error."},{status:503});
  const [{data:posts,error:postError},{data:gscRows,error:gscError},{data:refreshes,error:refreshError},{data:history,error:historyError}]=await Promise.all([
    admin.from("blog_posts").select("id,slug,title,primary_keyword").eq("status","published").limit(1000),
    admin.from("site_gsc_metrics").select("page_url,clicks,impressions,avg_position,prev_clicks,prev_impressions,prev_avg_position").eq("page_group","blog").limit(1000),
    admin.from("seo_content_refreshes").select("*").order("created_at",{ascending:false}).limit(1000),
    admin.from("seo_content_refresh_history").select("id,refresh_id,action,actor_email,details,created_at").order("created_at",{ascending:false}).limit(2000),
  ]);
  const err=postError||gscError||refreshError||historyError; if(err) return NextResponse.json({error:err.message},{status:500});
  const metricsBySlug=new Map<string,GscRow>(); for(const row of (gscRows??[]) as GscRow[]){ const slug=slugFromUrl(row.page_url); if(slug) metricsBySlug.set(slug,row); }
  const postById=new Map(((posts??[]) as BlogPost[]).map(p=>[p.id,p]));
  const activeByPost=new Map<string,RefreshRow>(); for(const r of (refreshes??[]) as RefreshRow[]){ if(!activeByPost.has(r.blog_post_id)&&r.status!=="cancelled") activeByPost.set(r.blog_post_id,r); }
  const queue=((posts??[]) as BlogPost[]).flatMap(post=>{
    const gsc=metricsBySlug.get(post.slug)??null; const reasons=declined(gsc); const refresh=activeByPost.get(post.id)??null;
    if(!reasons.length&&!refresh) return [];
    const comparison=refresh&&refresh.status==="completed"&&gsc?{
      clicks_delta:gsc.clicks-(refresh.baseline_clicks??0), impressions_delta:gsc.impressions-(refresh.baseline_impressions??0), position_delta:refresh.baseline_position==null||gsc.avg_position==null?null:refresh.baseline_position-gsc.avg_position,
    }:null;
    return [{post, gsc, reasons, refresh, comparison}];
  });
  return NextResponse.json({summary:{queue:queue.length,unassigned:queue.filter(x=>!x.refresh?.owner_email&&!x.refresh?.editor_email).length,overdue:queue.filter(x=>x.refresh?.due_date&&x.refresh.status!=="completed"&&x.refresh.due_date<new Date().toISOString().slice(0,10)).length,completed:queue.filter(x=>x.refresh?.status==="completed").length},queue,history:(history??[]).map((h:any)=>({...h,post:postById.get(((refreshes??[]) as RefreshRow[]).find(r=>r.id===h.refresh_id)?.blog_post_id??"")??null}))});
}

export async function POST(request:Request){
  const auth=await requireAdminApi(request); if(!auth.ok) return NextResponse.json({error:auth.error},{status:auth.status});
  const admin=getSupabaseAdmin(); if(!admin) return NextResponse.json({error:"Server configuration error."},{status:503});
  const body=await request.json().catch(()=>({})); const blogPostId=String(body.blog_post_id??""); if(!blogPostId) return NextResponse.json({error:"blog_post_id is required."},{status:400});
  const {data:gsc}=await admin.from("site_gsc_metrics").select("page_url,clicks,impressions,avg_position,prev_clicks,prev_impressions,prev_avg_position").eq("page_group","blog").limit(1000);
  const {data:post}=await admin.from("blog_posts").select("id,slug").eq("id",blogPostId).single(); if(!post) return NextResponse.json({error:"Blog post not found."},{status:404});
  const metric=((gsc??[]) as GscRow[]).find(r=>slugFromUrl(r.page_url)===post.slug)??null;
  const {data:refresh,error}=await admin.from("seo_content_refreshes").insert({blog_post_id:blogPostId,due_date:body.due_date||null,owner_email:body.owner_email||null,editor_email:body.editor_email||null,status:"queued",reason_codes:Array.isArray(body.reason_codes)?body.reason_codes:declined(metric),notes:body.notes||null,baseline_clicks:metric?.clicks??null,baseline_impressions:metric?.impressions??null,baseline_position:metric?.avg_position??null,baseline_captured_at:new Date().toISOString()}).select("*").single();
  if(error) return NextResponse.json({error:error.message},{status:500});
  await admin.from("seo_content_refresh_history").insert({refresh_id:refresh.id,action:"queued",actor_email:auth.email??null,details:{due_date:refresh.due_date,owner_email:refresh.owner_email,editor_email:refresh.editor_email,reason_codes:refresh.reason_codes}});
  return NextResponse.json({refresh},{status:201});
}

export async function PATCH(request:Request){
  const auth=await requireAdminApi(request); if(!auth.ok) return NextResponse.json({error:auth.error},{status:auth.status});
  const admin=getSupabaseAdmin(); if(!admin) return NextResponse.json({error:"Server configuration error."},{status:503});
  const body=await request.json().catch(()=>({})); const id=String(body.id??""); if(!id) return NextResponse.json({error:"id is required."},{status:400});
  const {data:existing,error:existingError}=await admin.from("seo_content_refreshes").select("*,blog_posts(slug)").eq("id",id).single(); if(existingError||!existing) return NextResponse.json({error:existingError?.message||"Refresh not found."},{status:404});
  const update:any={updated_at:new Date().toISOString()}; for(const key of ["due_date","owner_email","editor_email","status","notes"]){ if(key in body) update[key]=body[key]||null; }
  if(body.status==="completed"&&existing.status!=="completed"){
    const slug=existing.blog_posts?.slug; const {data:gsc}=await admin.from("site_gsc_metrics").select("page_url,clicks,impressions,avg_position").eq("page_group","blog").limit(1000); const metric=(gsc??[]).find((r:any)=>slugFromUrl(r.page_url)===slug)??null;
    update.completed_at=new Date().toISOString(); update.completed_clicks=metric?.clicks??null; update.completed_impressions=metric?.impressions??null; update.completed_position=metric?.avg_position??null; update.verification_due_at=new Date(Date.now()+28*86400000).toISOString();
  }
  if(body.verify===true){ update.verified_at=new Date().toISOString(); }
  const {data:refresh,error}=await admin.from("seo_content_refreshes").update(update).eq("id",id).select("*").single(); if(error) return NextResponse.json({error:error.message},{status:500});
  await admin.from("seo_content_refresh_history").insert({refresh_id:id,action:body.verify===true?"verified":String(body.status??"updated"),actor_email:auth.email??null,details:update});
  return NextResponse.json({refresh});
}
