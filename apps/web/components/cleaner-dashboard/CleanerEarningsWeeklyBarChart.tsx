"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatZarFromCents } from "@/lib/cleaner/cleanerZarFormat";
import type { EarningsDayPoint } from "@/lib/cleaner/earningsInsightsSeries";

type Row = EarningsDayPoint & { amountRand: number };

function toRandRow(p: EarningsDayPoint): Row {
  return { ...p, amountRand: p.cents / 100 };
}

export function CleanerEarningsWeeklyBarChart({
  points,
  bestYmd,
  onSelectDay,
}: {
  points: EarningsDayPoint[];
  bestYmd: string | null;
  /** When set, tapping a bar filters the timeline to that Johannesburg calendar day. */
  onSelectDay?: (ymd: string) => void;
}) {
  const data: Row[] = points.map(toRandRow);
  return (
    <div className="mt-2 w-full [&_.recharts-tooltip-wrapper]:outline-none">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 10, right: 6, left: 0, bottom: 4 }}>
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
          <YAxis hide domain={[0, "dataMax"]} />
          <Tooltip
            cursor={{ fill: "rgba(0,0,0,0.06)" }}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid var(--border)",
              fontSize: 12,
            }}
            formatter={(value: number | string) => {
              const v = typeof value === "number" ? value : Number(value);
              if (!Number.isFinite(v)) return "—";
              return formatZarFromCents(Math.round(v * 100));
            }}
            labelFormatter={(label) => String(label)}
          />
          <Bar dataKey="amountRand" radius={[8, 8, 0, 0]} animationDuration={550} isAnimationActive>
            {data.map((entry) => (
              <Cell
                key={entry.ymd}
                role={onSelectDay ? "button" : undefined}
                tabIndex={onSelectDay ? 0 : undefined}
                className={onSelectDay ? "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring" : undefined}
                onClick={onSelectDay ? () => onSelectDay(entry.ymd) : undefined}
                onKeyDown={
                  onSelectDay
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelectDay(entry.ymd);
                        }
                      }
                    : undefined
                }
                fill={
                  bestYmd && entry.ymd === bestYmd && entry.cents > 0
                    ? "rgb(37 99 235)"
                    : "rgb(161 161 170)"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
