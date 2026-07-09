"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

export type KpiSparklinePoint = { value: number };

export function FinanceKpiCard({
  icon: Icon,
  label,
  value,
  previousValue,
  growthPercent,
  sparkline,
  status = "neutral",
  loading,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  previousValue?: string;
  growthPercent?: number | null;
  sparkline?: KpiSparklinePoint[];
  status?: "positive" | "negative" | "neutral" | "warning";
  loading?: boolean;
}) {
  const up = growthPercent != null && growthPercent >= 0;
  const statusColors = {
    positive: "text-emerald-600",
    negative: "text-red-600",
    warning: "text-amber-600",
    neutral: "text-slate-900",
  };

  const chartData = (sparkline ?? []).map((p, i) => ({ i, v: p.value }));

  return (
    <div className="flex min-w-[200px] flex-1 flex-col rounded-lg border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[--sidebar-active]">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <span className="block text-xs text-slate-500">{label}</span>
          <span className={cn("mt-0.5 block text-lg font-bold tabular-nums", statusColors[status])}>
            {loading ? "—" : value}
          </span>
          {previousValue ? (
            <span className="mt-0.5 block text-xs text-slate-400">Prev: {previousValue}</span>
          ) : null}
          {growthPercent != null ? (
            <span
              className={cn(
                "mt-1 inline-flex items-center gap-0.5 text-xs font-medium",
                up ? "text-emerald-600" : "text-red-600",
              )}
            >
              {growthPercent === 0 ? (
                <Minus className="h-3 w-3" />
              ) : up ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {Math.abs(growthPercent)}%
            </span>
          ) : null}
        </div>
      </div>
      {chartData.length > 1 ? (
        <div className="mt-2 h-10 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <Line
                type="monotone"
                dataKey="v"
                stroke={status === "negative" ? "#ef4444" : "#408df7"}
                strokeWidth={1.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  );
}
