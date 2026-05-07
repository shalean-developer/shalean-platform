import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { humanizeLocationSlug } from "@/lib/seo/humanize-location-slug";
import { cn } from "@/lib/utils";

type GscRow = {
  slug: string;
  impressions: number | null;
  clicks: number | null;
  ctr: number | null;
  avg_position: number | null;
  ctr_pct_display: number | null;
};

function opportunityTier(score: number): { label: string; className: string } {
  if (score >= 1_500_000) return { label: "Huge", className: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200" };
  if (score >= 400_000) return { label: "High", className: "bg-blue-100 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200" };
  if (score >= 80_000) return { label: "Medium", className: "bg-amber-100 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100" };
  return { label: "Low", className: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" };
}

/**
 * Surfaces suburbs with solid impressions, middling rank (5–20), and weak CTR — typical quick-win local SEO.
 */
export function SeoInsightsTopOpportunities({ rows }: { rows: GscRow[] }) {
  const scored = rows
    .map((r) => {
      const impr = r.impressions ?? 0;
      const pos = r.avg_position;
      const ctr = typeof r.ctr === "number" ? r.ctr : 0;
      if (impr < 200 || pos == null || pos < 5 || pos > 20 || ctr <= 0) return null;
      const commercialIntent = pos >= 8 && pos <= 16 ? 1.25 : 1;
      const opportunity = (impr * commercialIntent) / Math.max(ctr, 0.004);
      return { slug: r.slug, opportunity, impr, pos, ctrPct: r.ctr_pct_display ?? Math.round(ctr * 10_000) / 100 };
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => b.opportunity - a.opportunity)
    .slice(0, 8);

  if (scored.length === 0) {
    return (
      <Card className="border-zinc-200/90 shadow-sm dark:border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base">Top SEO opportunities</CardTitle>
          <CardDescription>Impressions × rank window ÷ CTR — needs GSC rows with position 5–20.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No qualifying rows yet. Import `gscMetrics` with impressions, CTR, and average position for suburb hubs.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-zinc-200/90 shadow-sm dark:border-zinc-800">
      <CardHeader>
        <CardTitle className="text-base">Top SEO opportunities</CardTitle>
        <CardDescription>
          High impressions, rank ~5–20, CTR underperforming — prioritize titles, hero CTAs, and FAQ blocks here.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {scored.map((r) => {
            const tier = opportunityTier(r.opportunity);
            return (
              <li
                key={r.slug}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-100 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-950/40"
              >
                <span className="font-medium text-zinc-900 dark:text-zinc-50">{humanizeLocationSlug(r.slug)}</span>
                <span className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                  <span className="tabular-nums">impr {r.impr.toLocaleString()}</span>
                  <span className="tabular-nums">pos {r.pos.toFixed(1)}</span>
                  <span className="tabular-nums">CTR {r.ctrPct}%</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", tier.className)}>
                    {tier.label}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
