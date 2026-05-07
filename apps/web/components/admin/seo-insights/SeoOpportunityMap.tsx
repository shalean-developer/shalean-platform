"use client";

import { locationHubPathFromAreaInput, resolveCapeTownHubRowFromAreaInput } from "@/lib/seo/capeTownLocations";
import { humanizeLocationSlug } from "@/lib/seo/humanize-location-slug";
import { SeoInsightsEmptyState } from "@/components/admin/seo-insights/SeoInsightsEmptyState";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

export type SeoOpportunityMapPoint = {
  slug: string;
  label: string;
  hubHref: string;
  avgPosition: number;
  ctrPct: number;
  impressions: number;
};

type GscRow = {
  slug: string;
  impressions: number | null;
  ctr: number | null;
  avg_position: number | null;
  ctr_pct_display: number | null;
};

function toPoints(rows: GscRow[]): SeoOpportunityMapPoint[] {
  return rows
    .map((r) => {
      const pos = r.avg_position;
      const impr = r.impressions ?? 0;
      if (pos == null || Number.isNaN(pos) || impr < 80) return null;
      const ctrPct = r.ctr_pct_display ?? (typeof r.ctr === "number" ? Math.round(r.ctr * 10_000) / 100 : null);
      if (ctrPct == null) return null;
      const hub = resolveCapeTownHubRowFromAreaInput(r.slug);
      const label = hub?.name ?? humanizeLocationSlug(r.slug);
      const pt: SeoOpportunityMapPoint = {
        slug: r.slug,
        label,
        hubHref: locationHubPathFromAreaInput(r.slug) as string,
        avgPosition: pos,
        ctrPct,
        impressions: impr,
      };
      return pt;
    })
    .filter((x): x is SeoOpportunityMapPoint => x != null);
}

function OpportunityTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: SeoOpportunityMapPoint }[];
}) {
  if (!active || !payload?.[0]) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-md dark:border-zinc-700 dark:bg-zinc-950">
      <div className="font-semibold text-zinc-900 dark:text-zinc-50">{p.label}</div>
      <div className="mt-1 space-y-0.5 tabular-nums text-zinc-600 dark:text-zinc-400">
        <div>Avg position · {p.avgPosition.toFixed(1)}</div>
        <div>CTR · {p.ctrPct.toFixed(2)}%</div>
        <div>Impressions · {p.impressions.toLocaleString()}</div>
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

/**
 * Single high-signal chart: position vs CTR, bubble area ∝ impressions — “money page radar”.
 */
export function SeoOpportunityMap({ gscRows }: { gscRows: GscRow[] }) {
  const data = toPoints(gscRows);

  if (data.length < 2) {
    return (
      <Card className="border-zinc-200/90 shadow-sm dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base">SEO opportunity map</CardTitle>
          <CardDescription>Avg position vs CTR; dot size reflects impressions. Needs at least two GSC rows with position, CTR, and meaningful volume.</CardDescription>
        </CardHeader>
        <CardContent>
          <SeoInsightsEmptyState
            title="Not enough GSC points"
            description="Import `gscMetrics` with impressions, CTR, and average position for multiple hubs (min ~80 impressions per dot)."
          />
        </CardContent>
      </Card>
    );
  }

  const maxPos = Math.min(40, Math.max(12, ...data.map((d) => d.avgPosition)) + 2);
  const maxCtr = Math.max(8, ...data.map((d) => d.ctrPct)) * 1.15;

  return (
    <Card className="border-zinc-200/90 shadow-sm dark:border-zinc-800">
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">SEO opportunity map</CardTitle>
        <CardDescription>
          X · average position (left is stronger). Y · CTR (%). Bubble size · impressions — spot high-volume weak CTR
          and page-2 wins before rewriting titles or internal links.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="h-[min(360px,55vh)] w-full min-h-[280px] [&_.recharts-tooltip-wrapper]:outline-none">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 12, bottom: 28, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-700" />
              <XAxis
                type="number"
                dataKey="avgPosition"
                name="Avg position"
                domain={[1, maxPos]}
                tick={{ fontSize: 11, fill: "currentColor" }}
                className="text-zinc-500"
                label={{ value: "Avg position (GSC)", position: "bottom", offset: 12, className: "fill-zinc-500 text-[11px]" }}
              />
              <YAxis
                type="number"
                dataKey="ctrPct"
                name="CTR %"
                domain={[0, maxCtr]}
                tick={{ fontSize: 11, fill: "currentColor" }}
                className="text-zinc-500"
                width={48}
                label={{
                  value: "CTR %",
                  angle: -90,
                  position: "insideLeft",
                  className: "fill-zinc-500 text-[11px]",
                  offset: 4,
                }}
              />
              <ZAxis type="number" dataKey="impressions" range={[70, 520]} name="Impressions" />
              <Tooltip content={<OpportunityTooltip />} cursor={{ strokeDasharray: "4 4" }} />
              <Scatter name="Location hubs" data={data} fill="#2563eb" fillOpacity={0.72} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          High impressions + low CTR → title/meta refresh. Positions 5–15 + decent CTR → internal links & topical depth.
          Top-left cluster → SERP snippet and CTA tests.
        </p>
      </CardContent>
    </Card>
  );
}
