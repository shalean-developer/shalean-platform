import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeDomain(value: string) {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0]; }
}

function suspiciousReason(domain: string) {
  const d = domain.toLowerCase();
  const terms = ["casino","betting","poker","adult","porn","viagra","payday-loan","crypto-airdrop","link-farm","seo-links"];
  const hit = terms.find((term) => d.includes(term));
  if (hit) return `Domain contains review keyword: ${hit}`;
  if ((d.match(/-/g) ?? []).length >= 5) return "Domain has an unusually high number of hyphens.";
  return null;
}

function parseCsv(text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [] as Array<{source_url:string;target_url:string|null}>;
  const parseLine = (line:string) => {
    const out:string[]=[]; let current=""; let quoted=false;
    for(let i=0;i<line.length;i++){const c=line[i]; if(c==='"'){if(quoted&&line[i+1]==='"'){current+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){out.push(current.trim());current="";}else current+=c;} out.push(current.trim()); return out;
  };
  const first=parseLine(lines[0]);
  const lower=first.map((v)=>v.toLowerCase());
  const hasHeader=lower.some((v)=>/link|url|target|source|page/.test(v));
  const sourceIndex=Math.max(0,lower.findIndex((v)=>/source|linking page|latest links|links|url/.test(v)));
  const targetIndex=lower.findIndex((v)=>/target/.test(v));
  return lines.slice(hasHeader?1:0).map(parseLine).map((cols)=>({source_url:(cols[sourceIndex]||cols[0]||"").trim(),target_url:targetIndex>=0?(cols[targetIndex]||null):null})).filter((r)=>/^https?:\/\//i.test(r.source_url));
}

export async function GET(request: Request) {
  const auth = await requireAdminApi(request); if (!auth.ok) return NextResponse.json({error:auth.error},{status:auth.status});
  const admin=getSupabaseAdmin(); if(!admin) return NextResponse.json({error:"Server configuration error."},{status:503});
  const [{data:links,error},{data:imports},{data:opportunities}] = await Promise.all([
    admin.from("seo_backlinks").select("id,source_url,source_domain,target_url,first_seen_at,last_seen_at,verification_status,verified_at,suspicious,suspicious_reason,review_status,notes").order("last_seen_at",{ascending:false}).limit(2000),
    admin.from("seo_backlink_imports").select("id,source,import_type,imported_at,row_count,new_links,notes").order("imported_at",{ascending:false}).limit(20),
    admin.from("seo_backlink_opportunities").select("id,domain,url,opportunity_type,priority,status,rationale,owner,created_at,updated_at").order("created_at",{ascending:false}).limit(200),
  ]);
  if(error) return NextResponse.json({error:error.message},{status:500});
  const rows=links??[]; const domains=new Map<string,{domain:string;links:number;lastSeen:string;suspicious:number}>();
  for(const row of rows){const item=domains.get(row.source_domain)??{domain:row.source_domain,links:0,lastSeen:row.last_seen_at,suspicious:0};item.links++;if(row.last_seen_at>item.lastSeen)item.lastSeen=row.last_seen_at;if(row.suspicious)item.suspicious++;domains.set(row.source_domain,item);}
  const latestImport=(imports??[])[0];
  const since=latestImport?.imported_at?new Date(latestImport.imported_at).getTime():0;
  return NextResponse.json({
    summary:{backlinks:rows.length,referringDomains:domains.size,newSinceLastImport:rows.filter((r:any)=>new Date(r.first_seen_at).getTime()>=since).length,verifiedPresent:rows.filter((r:any)=>r.verification_status==="present").length,lost:rows.filter((r:any)=>r.verification_status==="lost").length,suspicious:rows.filter((r:any)=>r.suspicious&&r.review_status==="unreviewed").length,openOpportunities:(opportunities??[]).filter((o:any)=>o.status==="open").length},
    links:rows, domains:[...domains.values()].sort((a,b)=>b.links-a.links), imports:imports??[], opportunities:opportunities??[]
  });
}

export async function POST(request: Request) {
  const auth=await requireAdminApi(request); if(!auth.ok) return NextResponse.json({error:auth.error},{status:auth.status});
  const admin=getSupabaseAdmin(); if(!admin) return NextResponse.json({error:"Server configuration error."},{status:503});
  const body=await request.json().catch(()=>({}));
  if(body.action==="import_csv"){
    const rows=parseCsv(String(body.csv||"")); if(!rows.length) return NextResponse.json({error:"No valid http(s) backlink URLs found in the CSV."},{status:400});
    const {data:existing}=await admin.from("seo_backlinks").select("source_url").in("source_url",rows.map(r=>r.source_url));
    const known=new Set((existing??[]).map((r:any)=>r.source_url));
    const {data:imp,error:impError}=await admin.from("seo_backlink_imports").insert({source:"gsc_links_export",import_type:String(body.importType||"sample"),row_count:rows.length,new_links:rows.filter(r=>!known.has(r.source_url)).length,notes:body.notes||null}).select("id").single();
    if(impError) return NextResponse.json({error:impError.message},{status:500});
    for(const row of rows){const domain=normalizeDomain(row.source_url);const reason=suspiciousReason(domain);const payload={source_url:row.source_url,source_domain:domain,target_url:row.target_url,last_seen_at:new Date().toISOString(),latest_import_id:imp.id,suspicious:Boolean(reason),suspicious_reason:reason,updated_at:new Date().toISOString()};const {error}=await admin.from("seo_backlinks").upsert(payload,{onConflict:"source_url"});if(error)return NextResponse.json({error:error.message},{status:500});}
    return NextResponse.json({ok:true,imported:rows.length,newLinks:rows.filter(r=>!known.has(r.source_url)).length});
  }
  if(body.action==="verify"){
    const id=String(body.id||""); const {data:row,error}=await admin.from("seo_backlinks").select("id,source_url").eq("id",id).single(); if(error||!row)return NextResponse.json({error:error?.message||"Backlink not found."},{status:404});
    let status:"present"|"lost"|"unreachable"="unreachable";
    try{const response=await fetch(row.source_url,{redirect:"follow",signal:AbortSignal.timeout(15000),headers:{"User-Agent":"ShaleanSEOBacklinkVerifier/1.0"}});const html=await response.text();status=response.ok&&/https?:\/\/(?:www\.)?shalean\.co\.za/i.test(html)?"present":response.ok?"lost":"unreachable";}catch{}
    await admin.from("seo_backlinks").update({verification_status:status,verified_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",id);
    return NextResponse.json({ok:true,status});
  }
  if(body.action==="review"){
    const allowed=new Set(["unreviewed","safe","watch","remove_requested","disavow_review"]); const status=String(body.status||""); if(!allowed.has(status))return NextResponse.json({error:"Invalid review status."},{status:400});
    const {error}=await admin.from("seo_backlinks").update({review_status:status,notes:body.notes??null,updated_at:new Date().toISOString()}).eq("id",String(body.id||"")); if(error)return NextResponse.json({error:error.message},{status:500}); return NextResponse.json({ok:true});
  }
  if(body.action==="add_opportunity"){
    const domain=normalizeDomain(String(body.domain||"")); if(!domain)return NextResponse.json({error:"Domain is required."},{status:400});
    const {error}=await admin.from("seo_backlink_opportunities").insert({domain,url:body.url||null,opportunity_type:body.opportunityType||"outreach",priority:body.priority||"P2",rationale:body.rationale||null,owner:body.owner||null}); if(error)return NextResponse.json({error:error.message},{status:500}); return NextResponse.json({ok:true});
  }
  if(body.action==="update_opportunity"){
    const {error}=await admin.from("seo_backlink_opportunities").update({status:body.status,updated_at:new Date().toISOString()}).eq("id",String(body.id||"")); if(error)return NextResponse.json({error:error.message},{status:500}); return NextResponse.json({ok:true});
  }
  return NextResponse.json({error:"Unknown action."},{status:400});
}
