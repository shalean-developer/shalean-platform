"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import {
  PHASE15A_ANOMALIES_DEFAULT_MAX_SCAN,
  PHASE15A_ANOMALY_CATEGORY_SLUGS,
  PHASE15A_CLASSIFICATIONS,
  PHASE15A_UI_COPY,
  type Phase15aAnomaliesReadModel,
  type Phase15aAnomalyCategorySlug,
  type Phase15aAnomalyRow,
  type Phase15aClassification,
} from "@/lib/payout/phase15aAnomaliesShared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";

async function readJson<T>(res: Response): Promise<T & { error?: string }> {
  const text = await res.text();
  if (!text.trim()) return {} as T & { error?: string };
  try {
    return JSON.parse(text) as T & { error?: string };
  } catch {
    return { error: res.ok ? "Invalid JSON" : text.slice(0, 300) } as T & { error?: string };
  }
}

function slugLabel(slug: Phase15aAnomalyCategorySlug): string {
  switch (slug) {
    case "ledger_ahead":
      return "Ledger vs booking (ledger ahead)";
    case "authority_ahead":
      return "Ledger vs booking (authority ahead)";
    case "batched_claimable":
      return "Ledger vs booking (batched + claim-shaped)";
    case "claim_shadow":
      return "Claim eligibility shadow";
    case "batch_authority":
      return "Weekly batch authority";
    case "transfer_authority":
      return "Payout transfer authority";
    default:
      return slug;
  }
}

function classificationBadgeLabel(c: Phase15aClassification): string {
  return c.replace(/_candidate$/, "").replaceAll("_", " ");
}

export default function AdminPhase15aDiagnosticsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Phase15aAnomaliesReadModel | null>(null);
  const [limit, setLimit] = useState(40);
  const [category, setCategory] = useState<Phase15aAnomalyCategorySlug | "all">("all");
  const [classification, setClassification] = useState<Phase15aClassification | "all">("all");

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set("limit", String(limit));
    p.set("max_scan", String(PHASE15A_ANOMALIES_DEFAULT_MAX_SCAN));
    if (category !== "all") p.set("category", category);
    if (classification !== "all") p.set("classification", classification);
    return p.toString();
  }, [limit, category, classification]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sb = getSupabaseBrowser();
      const token = (await sb?.auth.getSession())?.data.session?.access_token;
      if (!token) throw new Error("Please sign in as an admin.");
      const res = await fetch(`/api/admin/payouts/phase15a-anomalies?${queryString}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await readJson<Phase15aAnomaliesReadModel>(res);
      if (!res.ok) throw new Error(json.error ?? "Could not load Phase 15A anomalies.");
      setData(json);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Load failed.");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void load();
  }, [load]);

  const flatRows: Phase15aAnomalyRow[] = useMemo(() => {
    if (!data) return [];
    const slugs =
      category === "all" ? PHASE15A_ANOMALY_CATEGORY_SLUGS : ([category] as Phase15aAnomalyCategorySlug[]);
    return slugs.flatMap((s) => data.rows_by_category[s] ?? []);
  }, [data, category]);

  const matrixEntries = useMemo(() => {
    if (!data) return [];
    const acc: { cat: Phase15aAnomalyCategorySlug; cl: Phase15aClassification; n: number }[] = [];
    for (const cat of PHASE15A_ANOMALY_CATEGORY_SLUGS) {
      for (const cl of PHASE15A_CLASSIFICATIONS) {
        const n = data.counts_by_category_and_classification[cat]?.[cl] ?? 0;
        if (n > 0) acc.push({ cat, cl, n });
      }
    }
    return acc;
  }, [data]);

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Finance · Phase 15A</p>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Payout convergence anomalies
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">{PHASE15A_UI_COPY.specRef}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-xs normal-case" data-testid="phase15a-measurement-badge">
            {PHASE15A_UI_COPY.badge}
          </Badge>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/payouts">Back to payouts</Link>
          </Button>
        </div>
      </div>

      <Card className="border-amber-200 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-amber-950 dark:text-amber-50">Measurement-only</CardTitle>
          <CardDescription
            className="text-amber-900/90 dark:text-amber-100/90"
            data-testid="phase15a-measurement-banner"
          >
            {PHASE15A_UI_COPY.banner}
          </CardDescription>
        </CardHeader>
      </Card>

      <Card className="border-sky-200 bg-sky-50/70 dark:border-sky-900/50 dark:bg-sky-950/25">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-sky-950 dark:text-sky-50">Classification (Week 3)</CardTitle>
          <CardDescription
            className="text-sky-950/90 dark:text-sky-100/90"
            data-testid="phase15a-classification-advisory"
          >
            {PHASE15A_UI_COPY.classificationAdvisory}
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="flex flex-wrap items-end gap-4">
        <Select
          id="cat"
          name="category"
          label="Category"
          className="w-[min(100%,280px)]"
          value={category}
          onChange={(e) =>
            setCategory((e.target.value === "all" ? "all" : e.target.value) as Phase15aAnomalyCategorySlug | "all")
          }
        >
          <option value="all">All categories</option>
          {PHASE15A_ANOMALY_CATEGORY_SLUGS.map((s) => (
            <option key={s} value={s}>
              {slugLabel(s)}
            </option>
          ))}
        </Select>
        <Select
          id="cls"
          name="classification"
          label="Classification"
          className="w-[min(100%,280px)]"
          value={classification}
          onChange={(e) =>
            setClassification(
              (e.target.value === "all" ? "all" : e.target.value) as Phase15aClassification | "all",
            )
          }
        >
          <option value="all">All classifications</option>
          {PHASE15A_CLASSIFICATIONS.map((c) => (
            <option key={c} value={c}>
              {classificationBadgeLabel(c)}
            </option>
          ))}
        </Select>
        <Select
          id="lim"
          name="limit"
          label="Limit per category"
          className="w-[min(100%,140px)]"
          value={String(limit)}
          onChange={(e) => setLimit(parseInt(e.target.value, 10) || 40)}
        >
          {[10, 25, 40, 80, 120].map((n) => (
            <option key={n} value={String(n)}>
              {n}
            </option>
          ))}
        </Select>
        <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}>
          Refresh
        </Button>
      </div>

      {data?.classification_filter_applied ? (
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          API filter active: <span className="font-mono">{data.classification_filter_applied}</span> — category
          counts and row tables reflect this slice; burn-in readiness still uses the full scan.
        </p>
      ) : null}

      {error ? (
        <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">
          {error}
        </p>
      ) : null}

      {loading && !data ? <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading…</p> : null}

      {data ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Phase 15B burn-in readiness (advisory)</CardTitle>
              <CardDescription>{data.burn_in_readiness.advisory_note}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <ul className="list-inside list-disc space-y-1 text-zinc-700 dark:text-zinc-300">
                <li>
                  Active blocker candidates:{" "}
                  <strong>{data.burn_in_readiness.has_active_blocker_candidates ? "yes" : "no"}</strong>
                </li>
                <li>
                  Refund-related candidates:{" "}
                  <strong>{data.burn_in_readiness.has_refund_related_candidates ? "yes" : "no"}</strong>
                </li>
                <li>
                  Missing relation candidates:{" "}
                  <strong>{data.burn_in_readiness.has_missing_relation_candidates ? "yes" : "no"}</strong>
                </li>
                <li>
                  Counts may be scan lower-bound:{" "}
                  <strong>{data.burn_in_readiness.counts_lower_bound_due_to_scan_cap ? "yes" : "no"}</strong>
                </li>
              </ul>
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-100">Suggested Phase 15B investigation</p>
                <p className="text-zinc-600 dark:text-zinc-400">
                  Categories with anomalies:{" "}
                  {data.burn_in_readiness.categories_suggested_for_phase15b_investigation.length
                    ? data.burn_in_readiness.categories_suggested_for_phase15b_investigation.join(", ")
                    : "none in this window"}
                </p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/40">
                <p className="text-xs font-semibold uppercase text-zinc-500">Pre-gate hint (not blocking)</p>
                <p className="mt-1 font-medium capitalize text-zinc-900 dark:text-zinc-50">
                  {data.phase15b_pre_gate_readiness.status.replace(/_/g, " ")}
                </p>
                <p className="mt-1 text-zinc-600 dark:text-zinc-400">{data.phase15b_pre_gate_readiness.rationale}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Summary</CardTitle>
              <CardDescription>
                Total anomalies (current API slice):{" "}
                <span className="font-semibold text-zinc-900 dark:text-zinc-50">{data.total_anomaly_count}</span>
                {Object.values(data.count_lower_bound_by_category).some(Boolean) ? (
                  <span className="text-amber-800 dark:text-amber-200">
                    {" "}
                    — some category counts may be lower bounds (scan cap {data.max_scan}).
                  </span>
                ) : null}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {PHASE15A_ANOMALY_CATEGORY_SLUGS.map((s) => (
                <div
                  key={s}
                  className="rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900/50"
                >
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">{slugLabel(s)}</p>
                  <p className="text-zinc-600 dark:text-zinc-400">
                    Count: <span className="font-mono">{data.counts_by_category[s] ?? 0}</span>
                    {data.count_lower_bound_by_category[s] ? " (lower bound)" : ""}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Counts by classification</CardTitle>
              <CardDescription>Advisory labels for Phase 15B triage.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {PHASE15A_CLASSIFICATIONS.map((c) => (
                <div
                  key={c}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-950/30"
                >
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">{classificationBadgeLabel(c)}</p>
                  <p className="font-mono text-zinc-600 dark:text-zinc-400">{data.counts_by_classification[c] ?? 0}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {matrixEntries.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Category × classification</CardTitle>
                <CardDescription>Non-zero intersections only.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2 text-xs">
                {matrixEntries.map(({ cat, cl, n }) => (
                  <span
                    key={`${cat}-${cl}`}
                    className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-1 font-mono dark:border-zinc-700 dark:bg-zinc-900/60"
                  >
                    {slugLabel(cat)} · {classificationBadgeLabel(cl)}: {n}
                  </span>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Latest rows</CardTitle>
              <CardDescription>
                Showing {flatRows.length} row(s) for the selected view (limit {data.limit} per category).
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-500 dark:border-zinc-800">
                    <th className="py-2 pr-3">Category</th>
                    <th className="py-2 pr-3">Class</th>
                    <th className="py-2 pr-3">Booking</th>
                    <th className="py-2 pr-3">Cleaner</th>
                    <th className="py-2 pr-3">Earning</th>
                    <th className="py-2 pr-3">Payout / transfer</th>
                    <th className="py-2 pr-3">Payment</th>
                    <th className="py-2 pr-3">Payout st.</th>
                    <th className="py-2 pr-3">Ledger</th>
                    <th className="py-2 pr-3">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {flatRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-6 text-center text-zinc-500">
                        No anomalies in this scan window.
                      </td>
                    </tr>
                  ) : (
                    flatRows.map((r, idx) => (
                      <tr
                        key={`${r.category_slug}-${r.booking_id}-${r.cleaner_earning_id}-${idx}`}
                        className="border-b border-zinc-100 dark:border-zinc-800/80"
                      >
                        <td className="py-2 pr-3 align-top text-xs text-zinc-600">{r.category_label}</td>
                        <td className="py-2 pr-3 align-top">
                          <Badge variant="outline" className="whitespace-nowrap text-[10px] font-normal">
                            {classificationBadgeLabel(r.classification)}
                          </Badge>
                          <div className="mt-1 max-w-[200px] truncate text-[10px] text-zinc-500">
                            {r.classification_reason}
                          </div>
                        </td>
                        <td className="py-2 pr-3 align-top font-mono text-xs">{r.booking_id ?? "—"}</td>
                        <td className="py-2 pr-3 align-top font-mono text-xs">{r.cleaner_id ?? "—"}</td>
                        <td className="py-2 pr-3 align-top font-mono text-xs">{r.cleaner_earning_id ?? "—"}</td>
                        <td className="py-2 pr-3 align-top font-mono text-xs">
                          {r.cleaner_payout_id ?? r.payout_id ?? "—"}
                          {r.payout_transfer_id ? (
                            <span className="block text-zinc-500">pt:{r.payout_transfer_id}</span>
                          ) : null}
                          {r.disbursement_id ? (
                            <span className="block text-zinc-500">disb:{r.disbursement_id}</span>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3 align-top text-xs">
                          <div>{r.payment_status ?? "—"}</div>
                          <div className="text-zinc-500">{r.payment_state ?? ""}</div>
                        </td>
                        <td className="py-2 pr-3 align-top text-xs">{r.payout_status ?? "—"}</td>
                        <td className="py-2 pr-3 align-top text-xs">{r.cleaner_earnings_status ?? "—"}</td>
                        <td className="py-2 pr-3 align-top text-xs text-zinc-700 dark:text-zinc-300">
                          {r.reason ?? "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </main>
  );
}
