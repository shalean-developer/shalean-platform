"use client";

import { useMemo, useState } from "react";
import { SeoFreshnessStatus } from "@/components/admin/seo-insights/SeoFreshnessStatus";
import { useAdminData } from "@/hooks/useAdminData";
import { cn } from "@/lib/utils";

const GROUPS = ["all", "core", "service", "blog", "location", "recruitment"] as const;
type Group = (typeof GROUPS)[number];

type GroupSummary = {
  page_group: Exclude<Group, "all">;
  pages: number;
  clicks: number;
  impressions: number;
  ctr: number;
  avg_position: number | null;
  previous: { clicks: number; impressions: number; ctr: number; avg_position: number | null };
  change: { clicks_pct: number | null; impressions_pct: number | null; ctr_pct: number | null; position_delta: number | null };
};

type PageRow = {
  page_url: string;
  page_group: Exclude<Group, "all">;
  clicks: number;
  impressions: number;
  ctr: number;
  avg_position: number | null;
  prev_clicks: number;
  prev_impressions: number;
  prev_avg_position: number | null;
};

type Payload = {
  selected_page_group: Group;
  available_page_groups: Exclude<Group, "all">[];
  groups: GroupSummary[];
  rows: PageRow[];
  page_count: number;
  total_page_count: number;
  synced_at: string | null;
};

const LABELS: Record<Group, string> = {
  all: "All pages",
  core: "Core",
  service: "Services",
  blog: "Blog",
  location: "Locations",
  recruitment: "Recruitment",
};

function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function change(value: number | null, invert = false) {
  if (value == null) return "—";
  const positive = invert ? value < 0 : value > 0;
  const neutral = value === 0;
  return (
    <span className={cn("font-medium", neutral ? "text-slate-500" : positive ? "text-emerald-600" : "text-red-600")}>
      {value > 0 ? "+" : ""}{value}%
    </span>
  );
}

export function SeoPageGroupDashboard() {
  const [group, setGroup] = useState<Group>("all");
  const params = useMemo(() => ({ page_group: group }), [group]);
  const { data, loading, error } = useAdminData<Payload>("/api/admin/seo-insights/gsc-site", { params });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">SEO Page Groups</h1>
        <p className="mt-1 text-sm text-slate-500">
          Compare Search Console performance across Core, Services, Blog, Locations and Recruitment without mixing unlike page types.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {GROUPS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setGroup(item)}
            className={cn(
              "rounded-xl border px-3 py-2 text-sm font-medium transition",
              group === item
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
            )}
          >
            {LABELS[item]}
          </button>
        ))}
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      {loading ? <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading SEO page groups…</div> : null}

      {!loading && data ? (
        <>
          <SeoFreshnessStatus syncedAt={data.synced_at} />

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {data.groups.map((item) => (
              <button
                key={item.page_group}
                type="button"
                onClick={() => setGroup(item.page_group)}
                className={cn(
                  "rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:border-slate-300",
                  group === item.page_group ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-100",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900">{LABELS[item.page_group]}</p>
                  <span className="text-xs text-slate-500">{item.pages} pages</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-slate-500">Clicks</p><p className="font-bold text-slate-900">{item.clicks.toLocaleString()}</p>{change(item.change.clicks_pct)}</div>
                  <div><p className="text-slate-500">Impressions</p><p className="font-bold text-slate-900">{item.impressions.toLocaleString()}</p>{change(item.change.impressions_pct)}</div>
                  <div><p className="text-slate-500">CTR</p><p className="font-bold text-slate-900">{pct(item.ctr)}</p>{change(item.change.ctr_pct)}</div>
                  <div><p className="text-slate-500">Position</p><p className="font-bold text-slate-900">{item.avg_position?.toFixed(1) ?? "—"}</p>{change(item.change.position_delta, true)}</div>
                </div>
              </button>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="font-semibold text-slate-900">{LABELS[group]} performance</h2>
                <p className="text-xs text-slate-500">Showing {data.page_count} of {data.total_page_count} tracked pages.</p>
              </div>
              <p className="text-xs text-slate-500">Last synced {data.synced_at ? new Date(data.synced_at).toLocaleString("en-ZA") : "—"}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr><th className="px-4 py-3">Page</th><th className="px-4 py-3">Group</th><th className="px-4 py-3">Clicks</th><th className="px-4 py-3">Impressions</th><th className="px-4 py-3">CTR</th><th className="px-4 py-3">Avg. position</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.rows.map((row) => (
                    <tr key={row.page_url} className="hover:bg-slate-50/70">
                      <td className="max-w-xl truncate px-4 py-3 font-medium text-slate-800" title={row.page_url}>{row.page_url}</td>
                      <td className="px-4 py-3 text-slate-600">{LABELS[row.page_group]}</td>
                      <td className="px-4 py-3 tabular-nums text-slate-700">{row.clicks.toLocaleString()}</td>
                      <td className="px-4 py-3 tabular-nums text-slate-700">{row.impressions.toLocaleString()}</td>
                      <td className="px-4 py-3 tabular-nums text-slate-700">{pct(row.ctr)}</td>
                      <td className="px-4 py-3 tabular-nums text-slate-700">{row.avg_position?.toFixed(1) ?? "—"}</td>
                    </tr>
                  ))}
                  {data.rows.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No GSC rows are available for this page group yet.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
