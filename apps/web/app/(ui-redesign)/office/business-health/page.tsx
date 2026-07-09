"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  HeartPulse,
  Minus,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  OfficeZohoPageHeader,
  OfficeZohoSecondaryButton,
} from "@/components/admin/office/OfficeZohoChrome";
import { useAdminData } from "@/hooks/useAdminData";
import type { BusinessHealthScorePayload } from "@/lib/admin/expenses/businessHealthScore";
import { cn } from "@/lib/utils";

function TrendIcon({ trend, direction }: { trend: string; direction: string }) {
  const good = (direction === "positive" && trend === "up") || (direction === "negative" && trend === "down");
  const bad = (direction === "positive" && trend === "down") || (direction === "negative" && trend === "up");
  if (trend === "flat") return <Minus className="h-4 w-4 text-slate-400" />;
  if (good) return <ArrowUpRight className="h-4 w-4 text-emerald-600" />;
  if (bad) return <ArrowDownRight className="h-4 w-4 text-red-600" />;
  return trend === "up" ? <TrendingUp className="h-4 w-4 text-emerald-600" /> : <TrendingDown className="h-4 w-4 text-red-600" />;
}

const STATUS_CLS: Record<string, string> = {
  Excellent: "text-emerald-600",
  Good: "text-blue-600",
  Fair: "text-amber-600",
  "At Risk": "text-orange-600",
  Critical: "text-red-600",
};

export default function BusinessHealthPage() {
  const { data, loading, error, refetch } = useAdminData<BusinessHealthScorePayload>("/api/admin/business-health");

  const historyChart = useMemo(
    () => (data?.history ?? []).map((h) => ({ date: h.score_date.slice(5), score: h.overall_score })),
    [data?.history],
  );

  return (
    <div className="space-y-6 p-4 md:p-6">
      <OfficeZohoPageHeader
        title="Business Health Score"
        subtitle="Daily weighted score across revenue, margins, retention, utilization, and cash"
        live
        actions={
          <>
            <OfficeZohoSecondaryButton onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </OfficeZohoSecondaryButton>
            <Link href="/office/financial-dashboard" className="text-sm font-medium text-[#408df7] hover:underline">
              Executive dashboard →
            </Link>
          </>
        }
      />

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <section className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-blue-50/30 p-8 shadow-sm">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[--sidebar-active]/10">
            <HeartPulse className="h-10 w-10 text-[--sidebar-active]" />
          </div>
          <div>
            <p className="text-sm text-slate-500">Business Health Score</p>
            <p className="text-5xl font-bold tabular-nums text-slate-900">
              {loading ? "—" : data?.overall_score ?? 0}
              <span className="text-2xl font-normal text-slate-400"> / 100</span>
            </p>
            <p className={cn("mt-1 text-lg font-semibold", STATUS_CLS[data?.status_label ?? "Fair"] ?? "text-slate-700")}>
              {loading ? "—" : data?.status_label}
            </p>
            <p className="text-xs text-slate-400">As of {data?.score_date ?? "today"}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {(data?.metrics ?? []).map((m) => (
          <div key={m.key} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">{m.label}</p>
              <TrendIcon trend={m.trend} direction={m.direction} />
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{m.score}</p>
            <p className="text-xs text-slate-400">Weight {m.weight}%</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">Score history</h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={historyChart}>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="score" stroke="#408df7" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">Recommendations</h2>
          <ul className="space-y-2">
            {(data?.recommendations ?? []).map((r, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-700">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[--sidebar-active]" />
                {r}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
