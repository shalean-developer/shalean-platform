"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SeoAttributionTrendPoint } from "@/lib/admin/officeSeoAttributionPresentation";

function TrendTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: SeoAttributionTrendPoint }[];
}) {
  if (!active || !payload?.[0]) return null;
  const p = payload[0].payload;
  const cvr = p.starts > 0 ? Math.round((p.completed / p.starts) * 1000) / 10 : 0;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <div className="font-semibold text-slate-900">{p.label}</div>
      <div className="mt-1 space-y-0.5 tabular-nums text-slate-600">
        <div className="text-blue-600">Booking starts · {p.starts}</div>
        <div className="text-emerald-600">Completions · {p.completed}</div>
        <div className="text-slate-500">Start → complete · {cvr}%</div>
      </div>
    </div>
  );
}

export function SeoAttributionTrendChart({ points }: { points: SeoAttributionTrendPoint[] }) {
  return (
    <div className="h-[260px] w-full [&_.recharts-tooltip-wrapper]:outline-none">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
          <defs>
            <linearGradient id="seoAttrStarts" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="seoAttrCompleted" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#059669" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#059669" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            axisLine={{ stroke: "#e2e8f0" }}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip content={<TrendTooltip />} cursor={{ stroke: "#cbd5e1", strokeDasharray: "4 4" }} />
          <Area
            type="monotone"
            dataKey="starts"
            name="Booking starts"
            stroke="#2563eb"
            strokeWidth={2}
            fill="url(#seoAttrStarts)"
          />
          <Area
            type="monotone"
            dataKey="completed"
            name="Completions"
            stroke="#059669"
            strokeWidth={2}
            fill="url(#seoAttrCompleted)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
