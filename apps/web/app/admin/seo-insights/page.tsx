"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Payload = {
  since?: string;
  rows_loaded?: number;
  top_suburbs_by_cta_clicks?: { suburb: string; seo_cta_clicks: number }[];
  top_cta_compound?: { key: string; count: number }[];
  cta_kind_booking_proxy?: {
    cta_kind: string;
    cta_location?: string;
    key?: string;
    distinct_sessions: number;
    sessions_with_booking_start: number;
    conversion_pct: number;
  }[];
  scroll_depth_by_slug?: {
    slug: string;
    sessions_at_25: number;
    sessions_at_50: number;
    sessions_at_75: number;
    sessions_at_100: number;
    pct_read_to_100?: number;
    pct_to_50?: number;
    pct_to_75?: number;
    pct_to_100?: number;
  }[];
  gsc_import_snapshot?: {
    slug: string;
    impressions: number | null;
    clicks: number | null;
    ctr: number | null;
    avg_position: number | null;
    ctr_pct_display: number | null;
  }[];
  optimization?: {
    page_health_table?: {
      slug: string;
      health_score: number;
      health_band: string;
      winning_title_variant_db: string | null;
      suggested_title_variant_gsc: string | null;
      best_cta_key: string | null;
      hero_swap_applied: boolean;
    }[];
    recommendations?: {
      id: string;
      slug: string | null;
      kind: string;
      severity: string;
      title: string;
      detail: Record<string, unknown>;
      confidence: number;
      applied_at: string | null;
      created_at: string;
    }[];
  };
  notes?: string[];
  error?: string;
};

function bandBadgeClass(band: string): string {
  if (band === "strong") return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200";
  if (band === "needs_improvement")
    return "bg-amber-100 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100";
  return "bg-rose-100 text-rose-950 dark:bg-rose-950/40 dark:text-rose-100";
}

export default function AdminSeoInsightsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Payload | null>(null);
  const [healthFilter, setHealthFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = getSupabaseBrowser();
      const token = (await sb?.auth.getSession())?.data.session?.access_token;
      if (!token) {
        if (!cancelled) {
          setError("Sign in as admin.");
          setLoading(false);
        }
        return;
      }
      const res = await fetch("/api/admin/seo-insights", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as Payload;
      if (cancelled) return;
      if (!res.ok) setError(json.error ?? "Failed to load SEO insights.");
      else setError(null);
      setData(res.ok ? json : null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredHealth = useMemo(() => {
    const rows = data?.optimization?.page_health_table ?? [];
    const q = healthFilter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.slug.toLowerCase().includes(q));
  }, [data?.optimization?.page_health_table, healthFilter]);

  return (
    <main className="mx-auto max-w-6xl space-y-8 pb-16">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">SEO location insights</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Rollup from <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-800">user_events</code> (last 30 days),
          imported GSC snapshots, and the automated optimizer (DB-backed title variants + hub UI patches).
        </p>
      </div>

      {loading ? (
        <div className="h-48 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
      ) : error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </p>
      ) : (
        <>
          <p className="text-xs text-zinc-500">
            Window since {data?.since ?? "—"} · {data?.rows_loaded ?? 0} rows scanned
          </p>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Automation · page health</CardTitle>
              <CardDescription>
                Weighted blend of imported GSC CTR, scroll depth, and suburb-level booking-start proxy. Title variant
                column reflects `seo_auto_title_variant` when auto-apply ran.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="flex max-w-md flex-col gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                Filter by slug
                <input
                  value={healthFilter}
                  onChange={(e) => setHealthFilter(e.target.value)}
                  placeholder="e.g. sea-point-cleaning-services"
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
                />
              </label>
              <div className="max-h-[420px] overflow-auto text-xs">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-700">
                      <th className="py-2 pr-2 font-semibold">Slug</th>
                      <th className="py-2 pr-2 font-semibold">Health</th>
                      <th className="py-2 pr-2 font-semibold">Band</th>
                      <th className="py-2 pr-2 font-semibold">Winning title</th>
                      <th className="py-2 pr-2 font-semibold">Best CTA</th>
                      <th className="py-2 font-semibold">Hero swap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHealth.map((r) => (
                      <tr key={r.slug} className="border-b border-zinc-100 dark:border-zinc-800">
                        <td className="py-1.5 pr-2 font-mono text-[11px] text-zinc-800 dark:text-zinc-200">{r.slug}</td>
                        <td className="py-1.5 pr-2 tabular-nums">{r.health_score}</td>
                        <td className="py-1.5 pr-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${bandBadgeClass(r.health_band)}`}
                          >
                            {r.health_band.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="py-1.5 pr-2 font-mono text-[11px]">
                          {r.winning_title_variant_db ?? r.suggested_title_variant_gsc ?? "—"}
                        </td>
                        <td className="py-1.5 pr-2 font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                          {r.best_cta_key ?? "—"}
                        </td>
                        <td className="py-1.5">{r.hero_swap_applied ? "yes" : "no"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredHealth.length === 0 ? (
                  <p className="py-6 text-sm text-zinc-500">No rows match this filter.</p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recommendations queue</CardTitle>
              <CardDescription>
                Latest rows from `seo_insights_recommendations` (cron: `/api/cron/seo-optimization`).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="max-h-96 space-y-3 overflow-auto text-sm">
                {(data?.optimization?.recommendations ?? []).map((rec) => (
                  <li
                    key={rec.id}
                    className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-semibold text-zinc-900 dark:text-zinc-50">{rec.title}</span>
                      <span className="text-[11px] uppercase tracking-wide text-zinc-500">{rec.severity}</span>
                    </div>
                    <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                      {rec.kind}
                      {rec.slug ? (
                        <>
                          {" "}
                          · <span className="font-mono">{rec.slug}</span>
                        </>
                      ) : null}{" "}
                      · confidence {(rec.confidence * 100).toFixed(0)}%
                    </div>
                  </li>
                ))}
                {(data?.optimization?.recommendations?.length ?? 0) === 0 ? (
                  <li className="text-zinc-500">No recommendations stored yet — run the optimizer cron.</li>
                ) : null}
              </ul>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top suburbs (SEO CTA clicks)</CardTitle>
                <CardDescription>From `seo_cta_click` with `page_type: seo_location`.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="max-h-72 space-y-2 overflow-auto text-sm">
                  {(data?.top_suburbs_by_cta_clicks ?? []).map((r) => (
                    <li key={r.suburb} className="flex justify-between gap-4 border-b border-zinc-100 py-1 dark:border-zinc-800">
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">{r.suburb}</span>
                      <span className="tabular-nums text-zinc-600 dark:text-zinc-400">{r.seo_cta_clicks}</span>
                    </li>
                  ))}
                  {(data?.top_suburbs_by_cta_clicks?.length ?? 0) === 0 ? (
                    <li className="text-zinc-500">No events yet.</li>
                  ) : null}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Imported GSC · highest CTR</CardTitle>
                <CardDescription>
                  Manual `gscMetrics` entries (CTR stored as fraction; column shows %).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="max-h-72 space-y-2 overflow-auto text-xs font-mono">
                  {(data?.gsc_import_snapshot ?? []).map((r) => (
                    <li key={r.slug} className="border-b border-zinc-100 py-1 dark:border-zinc-800">
                      <div className="font-semibold text-zinc-800 dark:text-zinc-200">{r.slug}</div>
                      <div className="text-zinc-600 dark:text-zinc-400">
                        CTR {r.ctr_pct_display != null ? `${r.ctr_pct_display}%` : "—"} · pos{" "}
                        {r.avg_position != null ? r.avg_position.toFixed(1) : "—"} · clicks {r.clicks ?? "—"} · impr.{" "}
                        {r.impressions ?? "—"}
                      </div>
                    </li>
                  ))}
                  {(data?.gsc_import_snapshot?.length ?? 0) === 0 ? (
                    <li className="font-sans text-sm text-zinc-500">No `gscMetrics` in env JSON.</li>
                  ) : null}
                </ul>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Most clicked CTAs</CardTitle>
              <CardDescription>Grouped by `cta_kind · cta_location · cta_label`.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="max-h-80 space-y-2 overflow-auto text-sm">
                {(data?.top_cta_compound ?? []).map((r) => (
                  <li key={r.key} className="flex justify-between gap-4 border-b border-zinc-100 py-1 dark:border-zinc-800">
                    <span className="text-zinc-800 dark:text-zinc-200">{r.key}</span>
                    <span className="shrink-0 tabular-nums text-zinc-600 dark:text-zinc-400">{r.count}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Scroll depth · drop-off proxy</CardTitle>
                <CardDescription>
                  Distinct sessions reaching each milestone; `%→100` uses 100% readers ÷ 25% cohort.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-96 overflow-auto text-xs">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-700">
                        <th className="py-2 pr-2 font-semibold">Slug</th>
                        <th className="py-2 pr-2 font-semibold">25%</th>
                        <th className="py-2 pr-2 font-semibold">50%</th>
                        <th className="py-2 pr-2 font-semibold">75%</th>
                        <th className="py-2 pr-2 font-semibold">100%</th>
                        <th className="py-2 font-semibold">%→100</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.scroll_depth_by_slug ?? []).map((r) => (
                        <tr key={r.slug} className="border-b border-zinc-100 dark:border-zinc-800">
                          <td className="py-1.5 pr-2 font-mono text-[11px] text-zinc-800 dark:text-zinc-200">{r.slug}</td>
                          <td className="py-1.5 pr-2 tabular-nums">{r.sessions_at_25}</td>
                          <td className="py-1.5 pr-2 tabular-nums">{r.sessions_at_50}</td>
                          <td className="py-1.5 pr-2 tabular-nums">{r.sessions_at_75}</td>
                          <td className="py-1.5 pr-2 tabular-nums">{r.sessions_at_100}</td>
                          <td className="py-1.5 tabular-nums">
                            {r.pct_to_100 != null ? `${r.pct_to_100}%` : `${r.pct_read_to_100 ?? 0}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">CTA kind · location → booking start</CardTitle>
                <CardDescription>
                  Distinct sessions with that `cta_kind`+`cta_location` pair that also fired `start_booking`.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="max-h-96 space-y-2 overflow-auto text-sm">
                  {(data?.cta_kind_booking_proxy ?? []).map((r) => (
                    <li
                      key={r.key ?? `${r.cta_kind}-${r.cta_location ?? ""}`}
                      className="flex flex-col gap-0.5 border-b border-zinc-100 py-2 dark:border-zinc-800"
                    >
                      <span className="font-semibold text-zinc-900 dark:text-zinc-50">
                        {r.cta_kind}
                        {r.cta_location ? (
                          <span className="font-normal text-zinc-600 dark:text-zinc-400"> · {r.cta_location}</span>
                        ) : null}
                      </span>
                      <span className="text-xs text-zinc-600 dark:text-zinc-400">
                        sessions {r.distinct_sessions} · booking {r.sessions_with_booking_start} · {r.conversion_pct}%
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {data?.notes?.length ? (
            <ul className="list-disc space-y-1 pl-5 text-xs text-zinc-500">
              {data.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </main>
  );
}
