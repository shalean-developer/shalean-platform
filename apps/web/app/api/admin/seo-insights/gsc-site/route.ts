import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { loadSiteGscPageGroups, type SiteGscPageGroup } from "@/lib/gsc/sync-site-gsc-metrics";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_GROUPS = ["core", "service", "blog", "location", "recruitment"] as const;

type SiteRow = {
  page_url: string;
  page_group: SiteGscPageGroup;
  clicks: number;
  impressions: number;
  ctr: number;
  avg_position: number | null;
  prev_clicks: number;
  prev_impressions: number;
  prev_avg_position: number | null;
  synced_at: string;
};

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function summarizeGroup(pageGroup: SiteGscPageGroup, rows: SiteRow[]) {
  let clicks = 0;
  let impressions = 0;
  let prevClicks = 0;
  let prevImpressions = 0;
  let positionSum = 0;
  let positionImpressions = 0;
  let prevPositionSum = 0;
  let prevPositionImpressions = 0;

  for (const row of rows) {
    clicks += row.clicks;
    impressions += row.impressions;
    prevClicks += row.prev_clicks;
    prevImpressions += row.prev_impressions;
    if (row.avg_position != null && row.impressions > 0) {
      positionSum += row.avg_position * row.impressions;
      positionImpressions += row.impressions;
    }
    if (row.prev_avg_position != null && row.prev_impressions > 0) {
      prevPositionSum += row.prev_avg_position * row.prev_impressions;
      prevPositionImpressions += row.prev_impressions;
    }
  }

  const avgPosition = positionImpressions > 0 ? positionSum / positionImpressions : null;
  const prevAvgPosition = prevPositionImpressions > 0 ? prevPositionSum / prevPositionImpressions : null;

  return {
    page_group: pageGroup,
    pages: rows.length,
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    avg_position: avgPosition,
    previous: {
      clicks: prevClicks,
      impressions: prevImpressions,
      ctr: prevImpressions > 0 ? prevClicks / prevImpressions : 0,
      avg_position: prevAvgPosition,
    },
    change: {
      clicks_pct: pctChange(clicks, prevClicks),
      impressions_pct: pctChange(impressions, prevImpressions),
      ctr_pct: pctChange(impressions > 0 ? clicks / impressions : 0, prevImpressions > 0 ? prevClicks / prevImpressions : 0),
      position_delta: avgPosition != null && prevAvgPosition != null
        ? Math.round((avgPosition - prevAvgPosition) * 10) / 10
        : null,
    },
  };
}

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const requestedGroup = new URL(request.url).searchParams.get("page_group")?.trim().toLowerCase() ?? "all";
  if (requestedGroup !== "all" && !PAGE_GROUPS.includes(requestedGroup as SiteGscPageGroup)) {
    return NextResponse.json({ error: "Invalid page_group." }, { status: 400 });
  }

  const snapshot = await loadSiteGscPageGroups(admin);
  if (snapshot.error && snapshot.rows.length === 0) {
    const missingTable = snapshot.error.includes("site_gsc_metrics") || snapshot.error.includes("does not exist");
    return NextResponse.json(
      { error: snapshot.error, groups: [], rows: [], synced_at: null },
      { status: missingTable ? 503 : 500 },
    );
  }

  const allRows = snapshot.rows as SiteRow[];
  const groups = PAGE_GROUPS.map((group) => summarizeGroup(group, allRows.filter((row) => row.page_group === group)));
  const rows = requestedGroup === "all"
    ? allRows
    : allRows.filter((row) => row.page_group === requestedGroup);

  return NextResponse.json({
    selected_page_group: requestedGroup,
    available_page_groups: PAGE_GROUPS,
    groups,
    rows,
    page_count: rows.length,
    total_page_count: allRows.length,
    synced_at: snapshot.syncedAt,
  });
}
