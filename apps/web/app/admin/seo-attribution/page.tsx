"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type Summary = {
  distinctSessionsQuoted: number;
  distinctSessionsCompleted: number;
  overallConversionPct: number;
  sessionsTracked: number;
  sessionsWithUtm: number;
  sessionsWithLandingCapture: number;
};

type LandingRow = { landing: string; quoted: number; completed: number; conversionPct: number };
type SourceRow = { source: string; medium: string; key: string; quoted: number; completed: number; conversionPct: number };
type ServiceRow = { service: string; quoted: number; completed: number; conversionPct: number };

export default function SeoAttributionAdminPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [since, setSince] = useState<string | null>(null);
  const [rowsLoaded, setRowsLoaded] = useState<number | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [byLanding, setByLanding] = useState<LandingRow[]>([]);
  const [bySource, setBySource] = useState<SourceRow[]>([]);
  const [byService, setByService] = useState<ServiceRow[]>([]);

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
      const res = await fetch("/api/admin/seo-attribution", { headers: { Authorization: `Bearer ${token}` } });
      const json = (await res.json()) as {
        error?: string;
        since?: string;
        rowsLoaded?: number;
        summary?: Summary | null;
        byLanding?: LandingRow[];
        bySource?: SourceRow[];
        byService?: ServiceRow[];
        message?: string;
      };
      if (cancelled) return;
      if (!res.ok) {
        setError(json.error ?? "Failed to load SEO attribution.");
        setLoading(false);
        return;
      }
      setSince(typeof json.since === "string" ? json.since : null);
      setRowsLoaded(typeof json.rowsLoaded === "number" ? json.rowsLoaded : null);
      setSummary(json.summary ?? null);
      setByLanding(Array.isArray(json.byLanding) ? json.byLanding : []);
      setBySource(Array.isArray(json.bySource) ? json.bySource : []);
      setByService(Array.isArray(json.byService) ? json.byService : []);
      if (json.message && !json.summary) setError(json.message);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto max-w-6xl space-y-8">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">SEO & acquisition attribution</h2>
        <p className="mt-1 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
          First-touch fields merged from the browser (<code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-800">landing_page_slug</code>,{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-800">utm_*</code>, GBP hints) correlated by{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-800">analytics_session_id</code>. Funnel start ={" "}
          <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-800">booking_service_selected</code>; conversion = same session also reaches{" "}
          <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-800">booking_completed</code>. Rolling ~30 days. See also{" "}
          <Link href="/admin/seo-insights" className="font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400">
            SEO insights
          </Link>
          .
        </p>
        {since && (
          <p className="mt-2 text-xs text-zinc-500">
            Window since <span className="font-mono">{since.slice(0, 10)}</span>
            {rowsLoaded != null ? ` · ${rowsLoaded.toLocaleString()} events scanned` : ""}
          </p>
        )}
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="h-28 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-28 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-28 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        </div>
      ) : error && !summary ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </p>
      ) : (
        <>
          {summary && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-xs text-zinc-500">Quote starts (sessions)</p>
                <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{summary.distinctSessionsQuoted.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-xs text-zinc-500">Completed (same cohort)</p>
                <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{summary.distinctSessionsCompleted.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-xs text-zinc-500">Session conversion</p>
                <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{summary.overallConversionPct.toFixed(1)}%</p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                <p className="text-xs text-zinc-500">Tracked sessions (first touch)</p>
                <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{summary.sessionsTracked.toLocaleString()}</p>
                <p className="mt-1 text-[10px] text-zinc-500">
                  UTM on first row: {summary.sessionsWithUtm.toLocaleString()} · landing captured: {summary.sessionsWithLandingCapture.toLocaleString()}
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>By landing path</CardTitle>
                <CardDescription>First-touch landing associated with the session.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {byLanding.length === 0 ? (
                  <p className="text-sm text-zinc-500">No quote starts in this window.</p>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-700">
                        <th className="pb-2 pr-2 font-medium">Landing</th>
                        <th className="pb-2 pr-2 font-medium">Starts</th>
                        <th className="pb-2 pr-2 font-medium">Done</th>
                        <th className="pb-2 font-medium">Conv.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byLanding.map((r) => (
                        <tr key={r.landing} className="border-b border-zinc-100 dark:border-zinc-800/80">
                          <td className="max-w-[220px] truncate py-2 pr-2 font-mono text-xs" title={r.landing}>
                            {r.landing}
                          </td>
                          <td className="py-2 pr-2">{r.quoted}</td>
                          <td className="py-2 pr-2">{r.completed}</td>
                          <td className="py-2">{r.conversionPct.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>By UTM source / medium</CardTitle>
                <CardDescription>Grouped from persisted acquisition payload.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {bySource.length === 0 ? (
                  <p className="text-sm text-zinc-500">No attributed quote starts.</p>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-700">
                        <th className="pb-2 pr-2 font-medium">Source</th>
                        <th className="pb-2 pr-2 font-medium">Medium</th>
                        <th className="pb-2 pr-2 font-medium">Starts</th>
                        <th className="pb-2 pr-2 font-medium">Done</th>
                        <th className="pb-2 font-medium">Conv.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bySource.map((r) => (
                        <tr key={r.key} className="border-b border-zinc-100 dark:border-zinc-800/80">
                          <td className="py-2 pr-2">{r.source}</td>
                          <td className="py-2 pr-2">{r.medium}</td>
                          <td className="py-2 pr-2">{r.quoted}</td>
                          <td className="py-2 pr-2">{r.completed}</td>
                          <td className="py-2">{r.conversionPct.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>By service (payload)</CardTitle>
              <CardDescription>Service type on funnel events when present.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {byService.length === 0 ? (
                <p className="text-sm text-zinc-500">No service-tagged quote starts.</p>
              ) : (
                <table className="w-full max-w-xl text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-xs text-zinc-500 dark:border-zinc-700">
                      <th className="pb-2 pr-2 font-medium">Service</th>
                      <th className="pb-2 pr-2 font-medium">Starts</th>
                      <th className="pb-2 pr-2 font-medium">Done</th>
                      <th className="pb-2 font-medium">Conv.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byService.map((r) => (
                      <tr key={r.service} className="border-b border-zinc-100 dark:border-zinc-800/80">
                        <td className="py-2 pr-2">{r.service}</td>
                        <td className="py-2 pr-2">{r.quoted}</td>
                        <td className="py-2 pr-2">{r.completed}</td>
                        <td className="py-2">{r.conversionPct.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
