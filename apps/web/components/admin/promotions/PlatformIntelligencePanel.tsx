"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock,
  Lightbulb,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { adminFetch } from "@/hooks/useAdminData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { emitAdminToast } from "@/lib/admin/toastBus";
import { cn } from "@/lib/utils";
import type {
  IntelligenceWindowHours,
  PublishIntelligenceSnapshot,
} from "@/lib/promotions/publishIntelligence";

type SnapshotPayload = PublishIntelligenceSnapshot & { ok?: boolean; error?: string };

type SavedView = {
  name: string;
  windowHours: IntelligenceWindowHours;
  provider: string;
  campaign: string;
};

const WINDOW_OPTIONS: IntelligenceWindowHours[] = [24, 72, 168];
const VIEWS_KEY = "mkt-001e-intel-views";

const SEVERITY_STYLES: Record<string, string> = {
  critical: "border-rose-200 bg-rose-50",
  warning: "border-amber-200 bg-amber-50",
  info: "border-slate-200 bg-slate-50",
};

const SEVERITY_BADGE: Record<string, string> = {
  critical: "bg-rose-100 text-rose-800",
  warning: "bg-amber-100 text-amber-900",
  info: "bg-slate-100 text-slate-700",
};

function pct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(0)}%`;
}

function msLabel(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function loadSavedViews(): SavedView[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(VIEWS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedView[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "slate",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: "slate" | "emerald" | "amber" | "rose" | "blue";
}) {
  const tones: Record<string, string> = {
    slate: "bg-slate-50 text-slate-600",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-800",
    rose: "bg-rose-50 text-rose-700",
    blue: "bg-blue-50 text-blue-700",
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
          {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
        </div>
        <span className={cn("rounded-lg p-2", tones[tone])}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
    </div>
  );
}

function FindingCard({
  item,
}: {
  item: {
    id: string;
    severity: string;
    title: string;
    why: string;
    triggeredBy: string[];
    evidence: Record<string, number | string | boolean | null>;
    action: string;
    runbookHref: string;
    runbookId: string;
    href?: string;
    detectedAt: string;
  };
}) {
  return (
    <li className={cn("rounded-xl border px-4 py-3", SEVERITY_STYLES[item.severity] ?? SEVERITY_STYLES.info)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                SEVERITY_BADGE[item.severity] ?? SEVERITY_BADGE.info,
              )}
            >
              {item.severity}
            </span>
            <p className="text-sm font-semibold text-slate-900">{item.title}</p>
          </div>
          <p className="mt-1 text-sm text-slate-700">
            <span className="font-medium">Why:</span> {item.why}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            <span className="font-medium">Triggered by:</span> {item.triggeredBy.join(", ")}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            <span className="font-medium">Evidence:</span>{" "}
            {Object.entries(item.evidence)
              .map(([k, v]) => `${k}=${v === null ? "null" : String(v)}`)
              .join(" · ")}
          </p>
          <p className="mt-1 text-xs text-slate-700">
            <span className="font-medium">Action:</span> {item.action}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">Detected {formatWhen(item.detectedAt)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Link href={item.runbookHref} className="text-xs font-medium text-blue-700 underline">
            Runbook: {item.runbookId}
          </Link>
          {item.href && item.href !== item.runbookHref ? (
            <Link href={item.href} className="text-xs text-slate-600 underline">
              Open context
            </Link>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function PlatformIntelligencePanel() {
  const searchParams = useSearchParams();
  const focus = searchParams.get("focus");
  const [windowHours, setWindowHours] = useState<IntelligenceWindowHours>(72);
  const [provider, setProvider] = useState("");
  const [campaign, setCampaign] = useState("");
  const [viewName, setViewName] = useState("");
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [data, setData] = useState<SnapshotPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [replaying, setReplaying] = useState<string | null>(null);

  useEffect(() => {
    setSavedViews(loadSavedViews());
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ windowHours: String(windowHours) });
    if (provider.trim()) qs.set("provider", provider.trim());
    if (campaign.trim()) qs.set("campaign", campaign.trim());
    const res = await adminFetch<SnapshotPayload>(
      `/api/admin/promotions/publish-intelligence?${qs.toString()}`,
    );
    if (res.error) {
      emitAdminToast(res.error, "error");
      setData(null);
    } else {
      setData(res.data ?? null);
    }
    setLoading(false);
  }, [windowHours, provider, campaign]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!focus || !data) return;
    const el = document.getElementById(`intel-${focus}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focus, data]);

  const maxTrend = useMemo(() => {
    if (!data?.trends?.length) return 1;
    return Math.max(1, ...data.trends.map((t) => t.published + t.failed + t.retries + t.dlq));
  }, [data]);

  const saveView = () => {
    const name = viewName.trim();
    if (!name) {
      emitAdminToast("Enter a view name.", "error");
      return;
    }
    const next = [
      ...savedViews.filter((v) => v.name !== name),
      { name, windowHours, provider: provider.trim(), campaign: campaign.trim() },
    ];
    window.localStorage.setItem(VIEWS_KEY, JSON.stringify(next));
    setSavedViews(next);
    setViewName("");
    emitAdminToast(`Saved view “${name}”.`, "success");
  };

  const applyView = (view: SavedView) => {
    setWindowHours(view.windowHours);
    setProvider(view.provider);
    setCampaign(view.campaign);
  };

  const deleteView = (name: string) => {
    const next = savedViews.filter((v) => v.name !== name);
    window.localStorage.setItem(VIEWS_KEY, JSON.stringify(next));
    setSavedViews(next);
  };

  const replayDlq = async (jobId: string) => {
    setReplaying(jobId);
    const res = await adminFetch<{ ok?: boolean; error?: string }>(
      `/api/admin/promotions/publish-jobs/${jobId}/replay`,
      { method: "POST" },
    );
    if (res.error) emitAdminToast(res.error, "error");
    else emitAdminToast("DLQ job queued for replay.", "success");
    setReplaying(null);
    await load();
  };

  const health = data?.operationalHealth;
  const queue = data?.queue;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Platform Intelligence</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Operational decision engine: health metrics, SLIs, data-quality checks, severity-ranked
            alerts, and explainable recommendations with runbooks. Staging-only — deterministic
            rules, not AI content generation.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      <section aria-label="Filters" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="mb-1 text-xs font-medium text-slate-500">Time range</p>
            <div className="flex rounded-lg border border-slate-200 p-1">
              {WINDOW_OPTIONS.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWindowHours(w)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium",
                    windowHours === w ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {w === 168 ? "7d" : `${w}h`}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500" htmlFor="intel-provider">
              Provider
            </label>
            <Input
              id="intel-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              placeholder="facebook"
              className="h-9 w-40"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500" htmlFor="intel-campaign">
              Campaign
            </label>
            <Input
              id="intel-campaign"
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              placeholder="Spring sale"
              className="h-9 w-48"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500" htmlFor="intel-view-name">
              Save view
            </label>
            <div className="flex gap-2">
              <Input
                id="intel-view-name"
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                placeholder="My ops view"
                className="h-9 w-40"
              />
              <Button type="button" size="sm" variant="outline" onClick={saveView}>
                <Save className="h-3.5 w-3.5" />
                Save
              </Button>
            </div>
          </div>
        </div>
        {savedViews.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-2">
            {savedViews.map((v) => (
              <li key={v.name} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs">
                <button type="button" className="font-medium text-slate-800 hover:underline" onClick={() => applyView(v)}>
                  {v.name}
                </button>
                <button type="button" aria-label={`Delete view ${v.name}`} onClick={() => deleteView(v.name)}>
                  <Trash2 className="h-3 w-3 text-slate-400" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {loading && !data ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading intelligence snapshot…
        </p>
      ) : null}

      {!loading && !data ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Could not load intelligence data. Confirm admin session and publish tables on this environment.
        </p>
      ) : null}

      {data && health && queue ? (
        <>
          <section aria-labelledby="intel-health-heading" className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 id="intel-health-heading" className="text-sm font-semibold text-slate-800">
                Operational health
              </h2>
              <p className="text-xs text-slate-500">
                Generated {formatWhen(data.generatedAt)} · window {data.windowHours}h
                {data.filters.provider ? ` · provider ${data.filters.provider}` : ""}
                {data.filters.campaign ? ` · campaign ${data.filters.campaign}` : ""}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Success rate"
                value={pct(health.publishSuccessRate)}
                hint={`Failure ${pct(health.failureRate)}`}
                icon={CheckCircle2}
                tone="emerald"
              />
              <MetricCard
                label="Retry rate"
                value={pct(health.retryRate)}
                hint={`${health.jobsAwaitingRetry} awaiting · retry success ${pct(health.retrySuccessRate)}`}
                icon={RotateCcw}
                tone="amber"
              />
              <MetricCard
                label="Queue depth"
                value={String(health.queueDepth)}
                hint={`DLQ ${health.dlqCount} · worker ${queue.workerStatus}`}
                icon={Activity}
                tone={health.dlqCount > 0 ? "rose" : "blue"}
              />
              <MetricCard
                label="Latency p50 / p95"
                value={`${msLabel(health.medianPublishLatencyMs)} / ${msLabel(health.p95PublishLatencyMs)}`}
                hint={`Avg ${msLabel(health.avgPublishLatencyMs)}`}
                icon={Clock}
                tone="slate"
              />
            </div>
          </section>

          <section id="intel-slis" aria-labelledby="intel-slis-heading" className="space-y-3">
            <h2 id="intel-slis-heading" className="text-sm font-semibold text-slate-800">
              Service level indicators
            </h2>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-left text-sm">
                <caption className="sr-only">SLI values versus targets</caption>
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">SLI</th>
                    <th className="px-3 py-2 font-medium">Value</th>
                    <th className="px-3 py-2 font-medium">Target</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.slis.map((s) => (
                    <tr key={s.id} className="border-t border-slate-100">
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-900">{s.name}</p>
                        <p className="text-xs text-slate-500">{s.description}</p>
                      </td>
                      <td className="px-3 py-2">
                        {s.unit === "ratio" ? pct(s.value) : msLabel(s.value)}
                      </td>
                      <td className="px-3 py-2">
                        {s.unit === "ratio" ? pct(s.target) : msLabel(s.target)}
                      </td>
                      <td className="px-3 py-2">
                        {s.met == null ? "—" : s.met ? (
                          <span className="text-emerald-700">Met</span>
                        ) : (
                          <span className="text-rose-700">Miss</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="intel-alerts" aria-labelledby="intel-alerts-heading" className="space-y-3">
            <h2 id="intel-alerts-heading" className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <ShieldAlert className="h-4 w-4" aria-hidden />
              Alerts
            </h2>
            {data.alerts.length === 0 ? (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                No operational alerts in this window.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.alerts.map((a) => (
                  <FindingCard key={a.id} item={a} />
                ))}
              </ul>
            )}
          </section>

          <section id="intel-recommendations" aria-labelledby="intel-rec-heading" className="space-y-3">
            <h2 id="intel-rec-heading" className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Lightbulb className="h-4 w-4" aria-hidden />
              Recommendations
            </h2>
            {data.recommendations.length === 0 ? (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                No recommendations — queue and providers look stable.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.recommendations.map((r) => (
                  <FindingCard key={r.id} item={r} />
                ))}
              </ul>
            )}
          </section>

          <section id="intel-data-quality" aria-labelledby="intel-dq-heading" className="space-y-3">
            <h2 id="intel-dq-heading" className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              Data quality
            </h2>
            {data.dataQuality.length === 0 ? (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                No data-quality issues detected.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.dataQuality.map((d) => (
                  <FindingCard key={d.id} item={d} />
                ))}
              </ul>
            )}
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section id="intel-queue" aria-labelledby="intel-queue-heading" className="space-y-3">
              <h2 id="intel-queue-heading" className="text-sm font-semibold text-slate-800">
                Queue intelligence
              </h2>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  {(
                    [
                      ["Queued", queue.queued],
                      ["Leased", queue.leased],
                      ["Retryable", queue.retryable],
                      ["Succeeded", queue.succeeded],
                      ["Dead letter", queue.dead_letter],
                      ["Retry backlog", queue.retryBacklog],
                      ["DLQ +24h", queue.dlqGrowth24h],
                      ["Throughput 24h", queue.workerThroughput24h],
                      ["Worker status", queue.workerStatus],
                      ["Worker last success", formatWhen(queue.workerLastSuccessAt)],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-2 border-b border-slate-100 pb-2">
                      <dt className="text-slate-500">{label}</dt>
                      <dd className="font-medium text-slate-900">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </section>

            <section id="intel-providers" aria-labelledby="intel-providers-heading" className="space-y-3">
              <h2 id="intel-providers-heading" className="text-sm font-semibold text-slate-800">
                Provider intelligence
              </h2>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="min-w-full text-left text-sm">
                  <caption className="sr-only">Provider success rates and error categories</caption>
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Provider</th>
                      <th className="px-3 py-2 font-medium">Success</th>
                      <th className="px-3 py-2 font-medium">Auth / RL</th>
                      <th className="px-3 py-2 font-medium">Health</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.providers.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-slate-500">
                          No provider activity in this window.
                        </td>
                      </tr>
                    ) : (
                      data.providers.map((p) => (
                        <tr key={p.provider} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-medium text-slate-900">{p.provider}</td>
                          <td className="px-3 py-2 text-slate-700">
                            {pct(p.successRate)}
                            <span className="block text-xs text-slate-500">
                              {p.successCount}/{p.attempts} · {msLabel(p.avgLatencyMs)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {p.authFailures} / {p.rateLimitFailures}
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {p.connectionHealth ?? "—"}
                            {p.stale ? <span className="ml-1 text-xs text-amber-700">(stale)</span> : null}
                            {p.unexpectedDisabled ? (
                              <span className="ml-1 text-xs text-rose-700">(disabled)</span>
                            ) : null}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <section id="intel-campaigns" aria-labelledby="intel-campaigns-heading" className="space-y-3">
            <h2 id="intel-campaigns-heading" className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <BarChart3 className="h-4 w-4" aria-hidden />
              Campaign intelligence
            </h2>
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Content status</p>
                <dl className="mt-3 space-y-2 text-sm">
                  {Object.entries(data.campaigns.draftVsPublished).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <dt className="capitalize text-slate-500">{k}</dt>
                      <dd className="font-medium text-slate-900">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Most successful</p>
                {data.campaigns.mostSuccessful.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">Not enough attempts in window.</p>
                ) : (
                  <ul className="mt-2 space-y-2 text-sm">
                    {data.campaigns.mostSuccessful.map((c) => (
                      <li key={c.campaignName} className="flex justify-between gap-2 border-b border-slate-100 pb-2">
                        <button
                          type="button"
                          className="truncate text-left font-medium text-blue-700 hover:underline"
                          onClick={() => setCampaign(c.campaignName)}
                        >
                          {c.campaignName}
                        </button>
                        <span className="shrink-0 text-slate-600">
                          {pct(c.successRate)} ({c.published}/{c.published + c.failed})
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {data.campaigns.repeatedFailures.length > 0 ? (
                  <>
                    <p className="mt-4 text-xs font-medium uppercase tracking-wide text-rose-700">
                      Repeated failures
                    </p>
                    <ul className="mt-2 space-y-2 text-sm">
                      {data.campaigns.repeatedFailures.map((c) => (
                        <li key={`fail-${c.campaignName}`} className="flex justify-between gap-2">
                          <button
                            type="button"
                            className="truncate text-left text-slate-900 hover:underline"
                            onClick={() => setCampaign(c.campaignName)}
                          >
                            {c.campaignName}
                          </button>
                          <span className="shrink-0 text-rose-700">
                            {c.failed} failed · {pct(c.successRate)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </div>
            </div>
          </section>

          <section id="intel-trends" aria-labelledby="intel-trends-heading" className="space-y-3">
            <h2 id="intel-trends-heading" className="text-sm font-semibold text-slate-800">
              Trends
            </h2>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex h-40 items-end gap-1">
                {data.trends.map((t) => {
                  const total = t.published + t.failed + t.retries + t.dlq;
                  const h = Math.max(4, Math.round((total / maxTrend) * 140));
                  return (
                    <div key={t.day} className="flex flex-1 flex-col items-center gap-1">
                      <div
                        className="flex w-full flex-col justify-end overflow-hidden rounded-t bg-slate-100"
                        style={{ height: h }}
                        title={`${t.day}: ${t.published} ok, ${t.failed} fail, ${t.retries} retry, ${t.dlq} dlq`}
                      >
                        <div
                          className="bg-emerald-500"
                          style={{ height: `${total ? (t.published / total) * 100 : 0}%` }}
                        />
                        <div
                          className="bg-rose-400"
                          style={{ height: `${total ? (t.failed / total) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-[9px] text-slate-400">{t.day.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section id="intel-dlq" aria-labelledby="intel-dlq-heading" className="space-y-3">
            <h2 id="intel-dlq-heading" className="text-sm font-semibold text-slate-800">
              Drill-down · DLQ & recent failures
            </h2>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full text-left text-sm">
                <caption className="sr-only">Dead-letter jobs and recent failures</caption>
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">When</th>
                    <th className="px-3 py-2 font-medium">Source</th>
                    <th className="px-3 py-2 font-medium">Provider</th>
                    <th className="px-3 py-2 font-medium">Campaign</th>
                    <th className="px-3 py-2 font-medium">Class / error</th>
                    <th className="px-3 py-2 font-medium">Ref</th>
                    <th className="px-3 py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.drilldown.dlqJobs.map((j) => (
                    <tr key={`dlq-${j.id}`} className="border-t border-slate-100">
                      <td className="px-3 py-2 text-slate-600">{formatWhen(j.deadLetteredAt)}</td>
                      <td className="px-3 py-2">DLQ</td>
                      <td className="px-3 py-2">
                        <button type="button" className="hover:underline" onClick={() => setProvider(j.provider)}>
                          {j.provider}
                        </button>
                      </td>
                      <td className="max-w-[10rem] truncate px-3 py-2">{j.campaignName ?? "—"}</td>
                      <td className="max-w-[14rem] px-3 py-2">
                        <span className="font-medium">{j.failureClass ?? "unknown"}</span>
                        <span className="block truncate text-xs text-slate-500">{j.lastError ?? ""}</span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{j.correlationId}</td>
                      <td className="px-3 py-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={replaying === j.id}
                          onClick={() => void replayDlq(j.id)}
                        >
                          {replaying === j.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Replay"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {data.drilldown.recentFailures
                    .filter((f) => f.source === "history")
                    .slice(0, 15)
                    .map((f) => (
                      <tr key={`hist-${f.id}`} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-600">{formatWhen(f.createdAt)}</td>
                        <td className="px-3 py-2">History</td>
                        <td className="px-3 py-2">{f.provider}</td>
                        <td className="max-w-[10rem] truncate px-3 py-2">{f.campaignName ?? "—"}</td>
                        <td className="max-w-[14rem] truncate px-3 py-2 text-slate-600">
                          {f.errorMessage ?? f.status}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{f.correlationId ?? "—"}</td>
                        <td className="px-3 py-2 text-slate-400">—</td>
                      </tr>
                    ))}
                  {data.drilldown.dlqJobs.length === 0 && data.drilldown.recentFailures.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-4 text-slate-500">
                        No DLQ jobs or recent failures in this window.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section id="intel-runbooks" aria-labelledby="intel-runbooks-heading" className="space-y-3">
            <h2 id="intel-runbooks-heading" className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <BookOpen className="h-4 w-4" aria-hidden />
              Operational runbooks
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.runbooks.map((rb) => (
                <li key={rb.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <Link href={rb.href} className="text-sm font-semibold text-blue-700 hover:underline">
                    {rb.title}
                  </Link>
                  <p className="mt-1 text-xs text-slate-600">{rb.summary}</p>
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500">
              Rule catalog:{" "}
              <code className="rounded bg-slate-100 px-1">
                docs/audits/marketing/MKT-001E-operational-intelligence-rules.md
              </code>
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}
