"use client";

import Link from "next/link";
import { SeoInsightsEmptyState } from "@/components/admin/seo-insights/SeoInsightsEmptyState";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

export type SeoMomentumMatrixPoint = {
  slug: string;
  label: string;
  hubHref: string;
  healthDelta: number;
  bookingsDelta: number;
};

function MatrixTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: SeoMomentumMatrixPoint }[];
}) {
  if (!active || !payload?.[0]) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-md dark:border-zinc-700 dark:bg-zinc-950">
      <div className="font-semibold text-zinc-900 dark:text-zinc-50">{p.label}</div>
      <div className="mt-1 space-y-0.5 tabular-nums text-zinc-600 dark:text-zinc-400">
        <div>Health Δ · {p.healthDelta > 0 ? "+" : ""}{p.healthDelta}</div>
        <div>Bookings Δ · {p.bookingsDelta > 0 ? "+" : ""}{p.bookingsDelta}</div>
      </div>
      <Link
        href={p.hubHref}
        className="mt-2 inline-block font-semibold text-blue-700 underline-offset-2 hover:underline dark:text-blue-400"
      >
        Open hub
      </Link>
    </div>
  );
}

/** X = health score delta, Y = booking-start proxy delta (current vs prior 30d). */
export function SeoMomentumMatrix({ points }: { points: SeoMomentumMatrixPoint[] }) {
  if (points.length < 2) {
    return (
      <Card className="border-zinc-200/90 shadow-sm dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base">Momentum matrix</CardTitle>
          <CardDescription>Health delta vs booking delta across hubs.</CardDescription>
        </CardHeader>
        <CardContent>
          <SeoInsightsEmptyState
            title="Not enough comparative points"
            description="Need at least two hubs with prior-window health scores and measurable movement."
          />
        </CardContent>
      </Card>
    );
  }

  const maxAbsH = Math.max(8, ...points.map((p) => Math.abs(p.healthDelta))) * 1.15;
  const maxAbsB = Math.max(3, ...points.map((p) => Math.abs(p.bookingsDelta))) * 1.2;

  return (
    <Card className="border-zinc-200/90 shadow-sm dark:border-zinc-800">
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">Momentum matrix</CardTitle>
        <CardDescription>
          Quadrants: right/up = health + bookings improving; left/down = pressure on both. Bubble size reflects combined
          |Δ|.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="h-[min(320px,50vh)] w-full min-h-[260px] [&_.recharts-tooltip-wrapper]:outline-none">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 12, bottom: 28, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-700" />
              <ReferenceLine x={0} stroke="#a1a1aa" strokeDasharray="4 4" />
              <ReferenceLine y={0} stroke="#a1a1aa" strokeDasharray="4 4" />
              <XAxis
                type="number"
                dataKey="healthDelta"
                name="Health Δ"
                domain={[-maxAbsH, maxAbsH]}
                tick={{ fontSize: 11, fill: "currentColor" }}
                className="text-zinc-500"
                label={{
                  value: "SEO health score Δ (current − prior 30d)",
                  position: "bottom",
                  offset: 12,
                  className: "fill-zinc-500 text-[11px]",
                }}
              />
              <YAxis
                type="number"
                dataKey="bookingsDelta"
                name="Bookings Δ"
                domain={[-maxAbsB, maxAbsB]}
                tick={{ fontSize: 11, fill: "currentColor" }}
                className="text-zinc-500"
                width={44}
                label={{
                  value: "Booking starts Δ",
                  angle: -90,
                  position: "insideLeft",
                  className: "fill-zinc-500 text-[11px]",
                  offset: 4,
                }}
              />
              <ZAxis
                type="number"
                dataKey="z"
                range={[60, 400]}
                name="Combined"
              />
              <Tooltip content={<MatrixTooltip />} cursor={{ strokeDasharray: "4 4" }} />
              <Scatter
                name="Hubs"
                data={points.map((p) => ({
                  ...p,
                  z: Math.abs(p.healthDelta) + Math.abs(p.bookingsDelta) * 2,
                }))}
                fill="#7c3aed"
                fillOpacity={0.75}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
