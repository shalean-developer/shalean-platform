"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock3, ExternalLink, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { useAdminData } from "@/hooks/useAdminData";
import { cn } from "@/lib/utils";

type Recommendation={id:string;title:string;slug:string|null;severity:string;workflow_status:"open"|"in_progress"|"applied"|"verified"|"dismissed";owner_email:string|null;updated_at:string};
type RecommendationPayload={rows:Recommendation[];counts:Record<string,number>};
type HealthRow={path?:string;slug?:string;title?:string;health:"critical"|"warning"|"healthy";issues:Array<{message:string}>};
type HealthPayload={summary:Record<string,number>;rows:HealthRow[]};
type GroupsPayload={synced_at:string|null;groups:Array<{page_group:string;pages:number;clicks:number;impressions:number;avg_position:number|null}>;total_page_count:number};
type AutomationRun={id:string;job:"gsc-sync"|"seo-optimization"|"sitemap-health"|"robots-health";status:"success"|"error";created_at:string;detail:string|null;errors:string[]};
type AutomationPayload={runs:AutomationRun[];run_count:number};

function tone(state:string){if(["failed","critical"].includes(state))return"border-red-200 bg-red-50 text-red-800";if(["stale","warning"].includes(state))return"border-amber-200 bg-amber-50 text-amber-800";return"border-emerald-200 bg-emerald-50 text-emerald-800";}
function freshnessState(s:string|null|undefined):"healthy"|"stale"|"failed"{if(!s)return"failed";const h=(Date.now()-new Date(s).getTime())/3_600_000;if(!Number.isFinite(h)||h>72)return"failed";if(h>36)return"stale";return"healthy";}
function Kpi({label,value,detail,href}:{label:string;value:string|number;detail:string;href?:string}){const card=<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>;return href?<Link href={href} className="block transition hover:-translate-y-0.5">{card}</Link>:card;}
function pageName(row:HealthRow){if(row.title)return row.title;if(row.path)return row.path;if(row.slug)return row.slug.replaceAll("-"," ");return"SEO page";}

export function SeoManagementCommandCentre(){
  const issues=useAdminData<RecommendationPayload>("/api/admin/seo-insights/recommendations");
  const service=useAdminData<HealthPayload>("/api/admin/seo-insights/service-health");
  const blog=useAdminData<HealthPayload>("/api/admin/seo-insights/blog-health");
  const groups=useAdminData<GroupsPayload>("/api/admin/seo-insights/gsc-site");
  const automation=useAdminData<AutomationPayload>("/api/admin/seo-insights/automation-history");
  const loading=issues.loading||service.loading||blog.loading||groups.loading||automation.loading;
  const errors=[issues.error,service.error,blog.error,groups.error,automation.error].filter(Boolean) as string[];
  const issueRows=issues.data?.rows??[];
  const open=issues.data?.counts?.open??0,inProgress=issues.data?.counts?.in_progress??0,applied=issues.data?.counts?.applied??0,verified=issues.data?.counts?.verified??0;
  const criticalPages=[...(service.data?.rows??[]),...(blog.data?.rows??[])].filter(r=>r.health==="critical");
  const warningPages=[...(service.data?.rows??[]),...(blog.data?.rows??[])].filter(r=>r.health==="warning");
  const latestRun=automation.data?.runs?.[0]??null;
  const freshness=freshnessState(groups.data?.synced_at);
  const wholeSitePages=groups.data?.total_page_count??0;
  const priority=[
    ...issueRows.filter(r=>r.workflow_status==="open"&&r.severity==="critical").slice(0,3).map(r=>({title:r.slug?`${r.title} — ${r.slug.replaceAll("-"," ")}`:r.title,detail:"Open workflow issue requiring owner/action",href:"/office/seo-insights/issues"})),
    ...criticalPages.slice(0,3).map(r=>({title:pageName(r),detail:r.issues[0]?.message??"Critical page-health issue",href:r.path?.startsWith("/services")?"/office/seo-insights/service-health":"/office/seo-insights/blog-health"})),
  ].slice(0,6);
  const failedAutomation=(automation.data?.runs??[]).some(r=>r.status==="error");
  const overallState=errors.length||failedAutomation||freshness==="failed"||criticalPages.length>0?"critical":freshness==="stale"||warningPages.length>0||open>0?"warning":"healthy";

  return <section className="space-y-5 rounded-3xl border border-slate-200 bg-slate-50/70 p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Canonical SEO overview</p><h1 className="mt-1 text-2xl font-bold text-slate-900">SEO Management Command Centre</h1><p className="mt-1 text-sm text-slate-500">Workflow issues are the source of truth for accountable SEO work. Whole-site GSC coverage and page-health signals provide supporting evidence.</p></div><div className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold",tone(overallState))}>{overallState==="healthy"?<CheckCircle2 className="h-4 w-4"/>:overallState==="warning"?<AlertTriangle className="h-4 w-4"/>:<TriangleAlert className="h-4 w-4"/>}{overallState}</div></div>
    {errors.length?<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">Some command-centre data could not load: {errors[0]}</div>:null}
    {loading?<div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500"><RefreshCw className="h-4 w-4 animate-spin"/>Loading unified SEO health…</div>:null}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><Kpi label="Open workflow issues" value={open} detail="Canonical actionable queue" href="/office/seo-insights/issues"/><Kpi label="In progress" value={inProgress} detail="Owned and being fixed" href="/office/seo-insights/issues"/><Kpi label="Applied" value={applied} detail="Awaiting verification" href="/office/seo-insights/issues"/><Kpi label="Verified" value={verified} detail="Closed with evidence" href="/office/seo-insights/issues"/><Kpi label="Critical page signals" value={criticalPages.length} detail={`${warningPages.length} additional warnings`}/><Kpi label="Whole-site GSC pages" value={wholeSitePages} detail="Core + Service + Blog + Location + Recruitment" href="/office/seo-insights/page-groups"/></div>
    <div className="grid gap-4 xl:grid-cols-3"><div className="xl:col-span-2 rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-900">Highest-priority actions</h2><p className="text-xs text-slate-500">Page-specific actions and critical workflow items, not generic score labels.</p></div><Link href="/office/seo-insights/issues" className="text-xs font-semibold text-slate-700 hover:underline">View workflow</Link></div><div className="mt-4 space-y-2">{priority.length?priority.map((item,i)=><Link href={item.href} key={`${item.title}-${i}`} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 hover:bg-slate-100"><div><p className="text-sm font-semibold text-slate-900">{item.title}</p><p className="mt-0.5 text-xs text-slate-500">{item.detail}</p></div><ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-slate-400"/></Link>):<p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">No critical SEO actions are currently queued.</p>}</div></div><div className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-semibold text-slate-900">Automation health</h2><div className="mt-4 space-y-3"><div className={cn("rounded-xl border p-3 text-sm",tone(freshness))}><div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4"/>GSC freshness: {freshness}</div><p className="mt-1 text-xs opacity-80">{groups.data?.synced_at?`Last sync ${new Date(groups.data.synced_at).toLocaleString("en-ZA")}`:"No successful sync timestamp available."}</p></div><div className={cn("rounded-xl border p-3 text-sm",latestRun?.status==="error"?tone("failed"):"border-slate-200 bg-slate-50 text-slate-800")}><div className="flex items-center gap-2 font-semibold"><Clock3 className="h-4 w-4"/>Latest automation</div><p className="mt-1 text-xs opacity-80">{latestRun?`${latestRun.job} · ${latestRun.status} · ${new Date(latestRun.created_at).toLocaleString("en-ZA")}`:"No recent run loaded."}</p></div><Link href="/office/seo-insights/performance" className="inline-flex text-xs font-semibold text-slate-700 hover:underline">Performance & automation →</Link></div></div></div>
  </section>;
}
