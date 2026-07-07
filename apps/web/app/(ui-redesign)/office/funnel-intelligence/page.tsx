"use client";

import { useMemo } from "react";
import {
  TrendingUp,
  ArrowDownRight,
  Lightbulb,
  Users,
  ShoppingCart,
  CreditCard,
  Eye,
  RefreshCw,
  AlertCircle,
  Loader2,
  Clock,
  Smartphone,
  Layers,
  AlertTriangle,
  Activity,
  Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminData } from "@/hooks/useAdminData";
import {
  buildOfficeFunnelAnomalies,
  buildOfficeFunnelInsights,
  buildOfficeFunnelKpis,
  buildOfficeFunnelSteps,
  buildOfficeFunnelSummaryLine,
  buildOfficeProductFlowSteps,
  dailyTrendMax,
  funnelStepLabel,
  hasFunnelActivity,
  hasSparseFunnelTracking,
  paymentCompletedCount,
  paymentCompletedSource,
  paymentCompletedSourceLabel,
  pctLabel,
  sliceDailyTrends,
  type BookingFunnelApiPayload,
  type FunnelDailyTrendRow,
  type FunnelSegmentRow,
  type FunnelStepConversionRow,
  type OfficeFunnelKpi,
  type OfficeFunnelRecommendation,
  type OfficeFunnelStep,
} from "@/lib/admin/officeFunnelPresentation";

const STEP_ICONS: LucideIcon[] = [Eye, Users, ShoppingCart, CreditCard];

const KPI_ICONS: Record<OfficeFunnelKpi["tone"], LucideIcon> = {
  emerald: Target,
  blue: TrendingUp,
  violet: Clock,
  orange: CreditCard,
};

const KPI_STYLES: Record<OfficeFunnelKpi["tone"], string> = {
  emerald: "bg-emerald-50 text-emerald-600",
  blue: "bg-blue-50 text-blue-600",
  violet: "bg-violet-50 text-violet-600",
  orange: "bg-orange-50 text-orange-600",
};

const PRIORITY_MAP: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-orange-100 text-orange-700",
  low: "bg-blue-100 text-blue-700",
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: "border-red-200 bg-red-50",
  warning: "border-orange-200 bg-orange-50",
  info: "border-slate-200 bg-slate-50",
};

function formatSince(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

function formatDayLabel(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return ymd.slice(5);
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

export default function FunnelIntelligencePage() {
  const { data, loading, error, refetch } = useAdminData<BookingFunnelApiPayload>("/api/admin/booking-funnel");

  const steps = useMemo(() => (data ? buildOfficeFunnelSteps(data) : []), [data]);
  const kpis = useMemo(() => (data ? buildOfficeFunnelKpis(data) : []), [data]);
  const productFlow = useMemo(() => (data ? buildOfficeProductFlowSteps(data) : []), [data]);
  const insights = useMemo(() => (data ? buildOfficeFunnelInsights(data) : []), [data]);
  const anomalies = useMemo(() => (data ? buildOfficeFunnelAnomalies(data) : []), [data]);
  const dailyTrends = useMemo(() => (data ? sliceDailyTrends(data, 14) : []), [data]);
  const trendMax = useMemo(() => dailyTrendMax(dailyTrends), [dailyTrends]);
  const summaryLine = data ? buildOfficeFunnelSummaryLine(data) : null;
  const paymentSource = data ? paymentCompletedSource(data) : "none";
  const paymentSourceLabel = paymentCompletedSourceLabel(paymentSource);
  const paidCount = data ? paymentCompletedCount(data) : 0;
  const maxVal = useMemo(
    () => (steps.length ? Math.max(...steps.map((s) => s.value), 1) : 1),
    [steps],
  );
  const windowLabel = formatSince(data?.since);
  const stepConversion = data?.intelligence?.stepConversion ?? [];
  const topExits = data?.topExitSteps ?? [];
  const errorsByStep = data?.errorsByStep ?? [];
  const deviceRows = data?.intelligence?.deviceBreakdown ?? [];
  const serviceRows = data?.intelligence?.serviceBreakdown ?? [];
  const addOnRate = data?.intelligence?.addOnAttachRatePct;
  const cleanerRate = data?.intelligence?.cleanerSelectionRatePct;

  return (
    <div className="space-y-5">
      <PageHeader
        loading={loading}
        onRefresh={() => void refetch()}
        windowLabel={windowLabel}
        sessions={data?.sessions ?? 0}
        funnelEventRows={data?.rows ?? 0}
        funnelViews={data?.sessionsWithFunnelView ?? 0}
      />

      {error ? <ErrorBanner message={error} /> : null}
      {data && hasSparseFunnelTracking(data) ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Limited <code className="text-xs">booking_events</code> step views in this window — funnel steps are inferred from{" "}
          <code className="text-xs">user_events</code> where possible. Drop-off precision improves as navigation telemetry accumulates.
        </div>
      ) : null}
      {data?.message ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{data.message}</div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading && !data
          ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />)
          : kpis.map((kpi) => <KpiCard key={kpi.label} kpi={kpi} />)}
      </div>

      {summaryLine ? (
        <div className="rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
              <Activity className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Executive summary</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-800">{summaryLine}</p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm xl:col-span-2">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Conversion funnel</h3>
              <p className="text-xs text-slate-500">
                Visitors through to paid booking (30 days)
                {paidCount > 0 ? (
                  <span className="ml-1 text-emerald-600">· {paidCount} paid ({paymentSourceLabel})</span>
                ) : null}
              </p>
            </div>
            {!loading && data && (addOnRate != null || cleanerRate != null) ? (
              <div className="flex flex-wrap gap-2 text-[11px]">
                {addOnRate != null ? (
                  <span className="rounded-full bg-violet-50 px-2.5 py-1 font-semibold text-violet-700">
                    Add-ons {pctLabel(addOnRate)}
                  </span>
                ) : null}
                {cleanerRate != null ? (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">
                    Cleaner pick {pctLabel(cleanerRate)}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          {loading && !data ? (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />)}</div>
          ) : !data || !hasFunnelActivity(data) ? (
            <EmptyState />
          ) : (
            <div className="space-y-3">
              {steps.map((s, i) => (
                <FunnelStepRow key={s.step} step={s} icon={STEP_ICONS[i] ?? Eye} maxVal={maxVal} isLast={i === steps.length - 1} />
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800">Product flow views</h3>
          <p className="mb-4 text-xs text-slate-500">Sessions reaching each booking step (checkout tile shows paid count)</p>
          {loading && !data ? (
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {productFlow.map((step) => (
                <div key={step.key} className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3 text-center">
                  <p className="text-lg font-bold text-slate-900">{step.views.toLocaleString("en-ZA")}</p>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-500">{step.label}</p>
                  {step.sub ? <p className="mt-0.5 text-[10px] font-semibold text-emerald-700">{step.sub}</p> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Daily funnel trend</h3>
            <p className="text-xs text-slate-500">Last 14 days — starts, completions, Paystack abandons</p>
          </div>
          <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-500" />Starts</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />Completed</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-rose-400" />Abandons</span>
          </div>
        </div>
        {loading && !data ? (
          <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
        ) : dailyTrends.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No daily trend data yet.</p>
        ) : (
          <DailyTrendChart rows={dailyTrends} max={trendMax} />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <StepConversionPanel rows={stepConversion} loading={loading && !data} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <RankedListCard title="Top exit steps" empty="No exit events recorded." rows={topExits.map((r) => ({ label: funnelStepLabel(r.step), value: r.count }))} loading={loading && !data} />
          <RankedListCard title="Errors by step" empty="No booking flow errors." rows={errorsByStep.map((r) => ({ label: funnelStepLabel(r.step), value: r.count }))} loading={loading && !data} tone="danger" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SegmentTable title="Device breakdown" icon={Smartphone} rows={deviceRows} loading={loading && !data} />
        <SegmentTable title="Service breakdown" icon={Layers} rows={serviceRows} loading={loading && !data} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <InsightPanel title="Insight feed" icon={Lightbulb} rows={insights} loading={loading && !data} empty="No insights for this window." />
        <InsightPanel title="Anomaly monitor" icon={AlertTriangle} rows={anomalies} loading={loading && !data} empty="No anomalies flagged." useSeverityBorder />
      </div>
    </div>
  );
}

function PageHeader({
  loading,
  onRefresh,
  windowLabel,
  sessions,
  funnelEventRows,
  funnelViews,
}: {
  loading: boolean;
  onRefresh: () => void;
  windowLabel: string | null;
  sessions: number;
  funnelEventRows: number;
  funnelViews: number;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-slate-900">Funnel Intelligence</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Conversion funnel, drop-off analysis, and automated recommendations from live booking analytics.
          {windowLabel ? (
            <span className="ml-1 text-slate-400">
              Since {windowLabel} · {sessions.toLocaleString("en-ZA")} correlated sessions · {funnelViews.toLocaleString("en-ZA")} with step views · {funnelEventRows.toLocaleString("en-ZA")} booking_events rows
            </span>
          ) : null}
        </p>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        Refresh
      </button>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-semibold">Could not load funnel intelligence</p>
        <p className="mt-0.5 text-red-700">{message}</p>
      </div>
    </div>
  );
}

function KpiCard({ kpi }: { kpi: OfficeFunnelKpi }) {
  const Icon = KPI_ICONS[kpi.tone];
  const [bg, color] = KPI_STYLES[kpi.tone].split(" ");
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{kpi.label}</p>
          <p className="mt-1.5 text-2xl font-bold text-slate-900">{kpi.value}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{kpi.sub}</p>
        </div>
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", bg)}>
          <Icon className={cn("h-5 w-5", color)} />
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <p className="py-8 text-center text-sm text-slate-500">
      No funnel activity in the last 30 days. Events flow from <code className="text-xs">booking_events</code> and{" "}
      <code className="text-xs">user_events</code>.
    </p>
  );
}

function FunnelStepRow({
  step,
  icon: Icon,
  maxVal,
  isLast,
}: {
  step: OfficeFunnelStep;
  icon: LucideIcon;
  maxVal: number;
  isLast: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-4">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white", step.color)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-800">{step.label}</span>
              <span className="text-sm font-bold text-slate-600">{step.value.toLocaleString("en-ZA")}</span>
              <span className="text-xs text-slate-400">({step.pct}%)</span>
            </div>
            {step.dropoff != null && step.dropoff > 0 ? (
              <div className="flex shrink-0 items-center gap-1 text-xs font-semibold text-red-600">
                <ArrowDownRight className="h-3.5 w-3.5" />
                -{step.dropoff.toLocaleString("en-ZA")} ({step.dropoffPct}%)
              </div>
            ) : step.label === "Payment completed" && step.value > 0 ? (
              <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                Paid
              </span>
            ) : null}
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-slate-100">
            <div
              className={cn("h-3 rounded-full transition-all", step.color)}
              style={{
                width: `${Math.min(100, Math.max((step.value / maxVal) * 100, step.value > 0 ? 4 : 0))}%`,
              }}
            />
          </div>
        </div>
      </div>
      {!isLast ? (
        <div className="ml-4 py-1">
          <div className="ml-3.5 h-4 w-1 rounded-full bg-slate-200" />
        </div>
      ) : null}
    </div>
  );
}

function DailyTrendChart({ rows, max }: { rows: FunnelDailyTrendRow[]; max: number }) {
  return (
    <div className="flex h-44 items-end gap-1.5 overflow-x-auto pb-1">
      {rows.map((d) => {
        const barBase = Math.max(d.starts, d.completed, 1);
        const barHeight = Math.max(4, (barBase / max) * 120);
        const completedHeight = Math.max(0, (d.completed / max) * 120);
        const abandonsHeight = Math.max(0, (d.paystackAbandons / max) * 120);
        return (
          <div
            key={d.date}
            className="flex min-w-[28px] flex-1 flex-col items-center justify-end gap-0.5"
            title={`${d.date}: ${d.starts} starts, ${d.completed} completed, ${d.paystackAbandons} Paystack abandons`}
          >
            <div className="relative flex w-full max-w-[14px] flex-col items-center justify-end" style={{ height: `${barHeight}px` }}>
              <div className="absolute inset-x-0 bottom-0 rounded-t bg-blue-300" style={{ height: `${barHeight}px` }} />
              <div
                className="absolute inset-x-0 bottom-0 rounded-t bg-emerald-500"
                style={{ height: `${Math.min(completedHeight, barHeight)}px` }}
              />
              {abandonsHeight > 0 ? (
                <div
                  className="absolute inset-x-0 rounded-t bg-rose-400"
                  style={{
                    bottom: `${Math.min(completedHeight, barHeight)}px`,
                    height: `${Math.min(abandonsHeight, Math.max(0, barHeight - completedHeight))}px`,
                  }}
                />
              ) : null}
            </div>
            <span className="mt-1 text-[9px] font-medium text-slate-400">{formatDayLabel(d.date)}</span>
          </div>
        );
      })}
    </div>
  );
}

function StepConversionPanel({ rows, loading }: { rows: FunnelStepConversionRow[]; loading: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-bold text-slate-800">Step-to-step conversion</h3>
      <p className="mb-4 text-xs text-slate-500">Session progression between steps, including checkout → paid</p>
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />)}</div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">No step conversion data.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={`${row.from}-${row.to}`} className="rounded-xl border border-slate-100 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-800">
                  {funnelStepLabel(row.from)} → {funnelStepLabel(row.to)}
                </span>
                <span className="text-sm font-bold text-emerald-700">{pctLabel(row.conversionPct)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                <span>{row.progressed}/{row.viewed} progressed</span>
                <span className="text-red-600">{pctLabel(row.dropOffPct)} drop-off</span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-slate-100">
                <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${Math.max(row.conversionPct, 0)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RankedListCard({
  title,
  rows,
  empty,
  loading,
  tone = "default",
}: {
  title: string;
  rows: Array<{ label: string; value: number }>;
  empty: string;
  loading: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-bold text-slate-800">{title}</h3>
      {loading ? (
        <div className="mt-3 space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-8 animate-pulse rounded-lg bg-slate-100" />)}</div>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li key={row.label} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span className="font-medium text-slate-700">{row.label}</span>
              <span className={cn("font-bold tabular-nums", tone === "danger" ? "text-red-600" : "text-slate-800")}>{row.value}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SegmentTable({
  title,
  icon: Icon,
  rows,
  loading,
}: {
  title: string;
  icon: LucideIcon;
  rows: FunnelSegmentRow[];
  loading: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-slate-500" />
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
      </div>
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />)}</div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">No segment data yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                <th className="pb-2 pr-3 font-semibold">Segment</th>
                <th className="pb-2 pr-3 font-semibold">Starts</th>
                <th className="pb-2 pr-3 font-semibold">Paid</th>
                <th className="pb-2 font-semibold">Conv.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-slate-50 last:border-0">
                  <td className="py-2.5 pr-3 font-medium text-slate-800">{row.label}</td>
                  <td className="py-2.5 pr-3 tabular-nums text-slate-600">{row.starts}</td>
                  <td className="py-2.5 pr-3 tabular-nums text-slate-600">{row.completed}</td>
                  <td className="py-2.5 tabular-nums font-semibold text-emerald-700">{pctLabel(row.conversionPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function InsightPanel({
  title,
  icon: Icon,
  rows,
  loading,
  empty,
  useSeverityBorder = false,
}: {
  title: string;
  icon: LucideIcon;
  rows: OfficeFunnelRecommendation[];
  loading: boolean;
  empty: string;
  useSeverityBorder?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-5 w-5 text-orange-500" />
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
      </div>
      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}</div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div
              key={r.id}
              className={cn(
                "rounded-xl border px-4 py-3",
                useSeverityBorder ? SEVERITY_STYLES[r.priority === "high" ? "critical" : r.priority === "medium" ? "warning" : "info"] : "border-slate-100",
              )}
            >
              <div className="flex items-start gap-3">
                <span className={cn("mt-0.5 shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize", PRIORITY_MAP[r.priority])}>
                  {r.priority}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{r.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{r.description}</p>
                  {r.category ? <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{r.category}</p> : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
