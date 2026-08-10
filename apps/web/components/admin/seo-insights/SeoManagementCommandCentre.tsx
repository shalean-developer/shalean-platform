"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock3, ExternalLink, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { useAdminData } from "@/hooks/useAdminData";
import { cn } from "@/lib/utils";

type Recommendation = { id:string; title:string; slug:string|null; severity:string; workflow_status:"open"|"in_progress"|"applied"|"verified"|"dismissed"; owner_email:string|null; updated_at:string };
type RecommendationPayload = { rows: Recommendation[]; summary?: Record<string, number> };
type HealthRow = { path?:string; slug?:string; title?:string; health:"critical"|"warning"|"healthy"; issues:Array<{message:string}>; metric?:{clicks:number;impressions:number;avg_position:number|null}|null; gsc?:{clicks:number;impressions:number;avg_position:number|null}|null };
type HealthPayload = { summary: Record<string, number>; rows: HealthRow[] };
type GroupsPayload = { syncedAt?:string|null; groups?:Array<{page_group:string;pages:number;clicks:number;impressions:number;avg_position:number|null}>; freshness?:{state?:string;label?:string} };
type AutomationPayload = { rows?:Array<{job_name?:string;route?:string;status?:string;ok?:boolean;created_at?:string;started_at?:string;completed_at?:string;error?:string|null}> };

function tone(state:string) {
  if (["failed","critical"].includes(state)) return "border-red-200 bg-red-50 text-red-800";
  if (["stale","warning"].includes(state)) return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

function Kpi({label,value,detail,href}:{label:string;value:string|number;detail:string;href?:string}) {
  const card = <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>;
  return href ? <Link href={href} className="block transition hover:-translate-y-0.5 hover:shadow-sm">{card}</Link> : card;
}

export function SeoManagementCommandCentre() {
  const issues = useAdminData<RecommendationPayload>("/api/admin/seo-insights/recommendations");
  const service = useAdminData<HealthPayload>("/api/admin/seo-insights/service-health");
  const blog = useAdminData<HealthPayload>("/api/admin/seo-insights/blog-health");
  const groups = useAdminData<GroupsPayload>("/api/admin/seo-insights/gsc-site");
  const automation = useAdminData<AutomationPayload>("/api/admin/seo-insights/automation-history");

  const loading = issues.loading || service.loading || blog.loading || groups.loading || automation.loading;
  const errors = [issues.error, service.error, blog.error, groups.error, automation.error].filter(Boolean) as string[];
  const issueRows = issues.data?.rows ?? [];
  const open = issueRows.filter(r=>r.workflow_status==="open").length;
  const inProgress = issueRows.filter(r=>r.workflow_status==="in_progress").length;
  const applied = issueRows.filter(r=>r.workflow_status==="applied").length;
  const verified = issueRows.filter(r=>r.workflow_status==="verified").length;
  const criticalPages = [...(service.data?.rows ?? []), ...(blog.data?.rows ?? [])].filter(r=>r.health==="critical");
  const warningPages = [...(service.data?.rows ?? []), ...(blog.data?.rows ?? [])].filter(r=>r.health==="warning");
  const latestRun = automation.data?.rows?.[0] ?? null;
  const freshness = groups.data?.freshness?.state ?? (groups.data?.syncedAt ? "healthy" : "failed");
  const priority = [
    ...issueRows.filter(r=>r.workflow_status==="open" && r.severity==="critical").slice(0,4).map(r=>({title:r.title,detail:r.slug?`/${r.slug}`:"SEO recommendation",href:"/office/seo-insights/issues",kind:"issue"})),
    ...criticalPages.slice(0,4).map(r=>({title:r.title ?? r.path ?? r.slug ?? "SEO page issue",detail:r.issues[0]?.message ?? "Critical page health issue",href:r.path?.startsWith("/services")?"/office/seo-insights/service-health":"/office/seo-insights/blog-health",kind:"page"})),
  ].slice(0,6);

  const totalGroups = groups.data?.groups?.reduce((n,g)=>n+g.pages,0) ?? 0;
  const overallState = errors.length ? "failed" : freshness === "failed" || criticalPages.length > 0 ? "critical" : freshness === "stale" || warningPages.length > 0 || open > 0 ? "warning" : "healthy";

  return <section className="space-y-5 rounded-3xl border border-slate-200 bg-slate-50/70 p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">SEO-015 Command Centre</p><h2 className="mt-1 text-xl font-bold text-slate-900">SEO Management Command Centre</h2><p className="mt-1 text-sm text-slate-500">One view for SEO health, automation, page performance and accountable work.</p></div><div className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold",tone(overallState))}>{overallState==="healthy"?<CheckCircle2 className="h-4 w-4"/>:overallState==="warning"?<AlertTriangle className="h-4 w-4"/>:<TriangleAlert className="h-4 w-4"/>}{overallState}</div></div>

    {errors.length ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">Some SEO command-centre data could not load: {errors[0]}</div> : null}
    {loading ? <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500"><RefreshCw className="h-4 w-4 animate-spin"/>Loading unified SEO health…</div> : null}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      <Kpi label="Open issues" value={open} detail="Need ownership/action" href="/office/seo-insights/issues"/>
      <Kpi label="In progress" value={inProgress} detail="Currently being fixed" href="/office/seo-insights/issues"/>
      <Kpi label="Applied" value={applied} detail="Awaiting verification" href="/office/seo-insights/issues"/>
      <Kpi label="Verified" value={verified} detail="Closed with evidence" href="/office/seo-insights/issues"/>
      <Kpi label="Critical pages" value={criticalPages.length} detail={`${warningPages.length} more warnings`}/>
      <Kpi label="GSC pages" value={totalGroups} detail={`Freshness: ${freshness}`} href="/office/seo-insights/page-groups"/>
    </div>

    <div className="grid gap-4 xl:grid-cols-3">
      <div className="xl:col-span-2 rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold text-slate-900">Highest-priority actions</h3><p className="text-xs text-slate-500">Critical open recommendations and critical service/blog pages.</p></div><Link href="/office/seo-insights/issues" className="text-xs font-semibold text-slate-700 hover:underline">View workflow</Link></div><div className="mt-4 space-y-2">{priority.length?priority.map((item,i)=><Link href={item.href} key={`${item.title}-${i}`} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 hover:bg-slate-100"><div><p className="text-sm font-semibold text-slate-900">{item.title}</p><p className="mt-0.5 text-xs text-slate-500">{item.detail}</p></div><ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-slate-400"/></Link>):<p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">No critical SEO actions are currently queued.</p>}</div></div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-semibold text-slate-900">Automation health</h3><div className="mt-4 space-y-3"><div className={cn("rounded-xl border p-3 text-sm",tone(freshness))}><div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4"/>GSC data: {freshness}</div><p className="mt-1 text-xs opacity-80">{groups.data?.syncedAt ? `Last sync ${new Date(groups.data.syncedAt).toLocaleString("en-ZA")}` : "No successful sync timestamp available."}</p></div><div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"><div className="flex items-center gap-2 font-semibold text-slate-800"><Clock3 className="h-4 w-4"/>Latest automation run</div><p className="mt-1 text-xs text-slate-500">{latestRun ? `${latestRun.job_name ?? latestRun.route ?? "SEO job"} · ${latestRun.status ?? (latestRun.ok ? "success" : "failed")}` : "No recent automation history loaded."}</p></div><Link href="/office/seo-insights/automation" className="inline-flex text-xs font-semibold text-slate-700 hover:underline">Open automation history →</Link></div></div>
    </div>

    <div className="flex flex-wrap gap-2 text-xs font-semibold"><Link className="rounded-lg border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50" href="/office/seo-insights/service-health">Service SEO</Link><Link className="rounded-lg border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50" href="/office/seo-insights/blog-health">Blog SEO</Link><Link className="rounded-lg border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50" href="/office/seo-insights/page-groups">Page groups</Link><Link className="rounded-lg border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50" href="/office/seo-insights/automation">Automation</Link><Link className="rounded-lg border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50" href="/office/seo-insights/issues">Issue workflow</Link></div>
  </section>;
}
