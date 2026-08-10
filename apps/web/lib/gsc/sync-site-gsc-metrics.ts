import "server-only";

import { google } from "googleapis";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildGscDateRange,
  buildGscPreviousDateRange,
  readGscCredentials,
  readGscSyncDays,
  type GscCredentials,
  type GscDateRange,
} from "@/lib/gsc/gsc-config";
import { describeGscConfigError } from "@/lib/gsc/gsc-config";

const GSC_READONLY_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const PAGE_ROW_LIMIT = 25_000;

export type SiteGscPageGroup = "core" | "service" | "blog" | "location" | "recruitment";

type SiteGscApiRow = {
  pageUrl: string;
  clicks: number;
  impressions: number;
  ctr: number;
  avgPosition: number | null;
};

type SiteGscMetricRow = {
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

export type SiteGscSyncSummary = {
  ok: boolean;
  rowsFetched: number;
  rowsMatched: number;
  rowsSaved: number;
  startDate: string;
  endDate: string;
  siteUrl: string | null;
  error?: string;
};

function createSearchConsoleClient(credentials: GscCredentials) {
  const auth = new google.auth.JWT({
    email: credentials.clientEmail,
    key: credentials.privateKey,
    scopes: [GSC_READONLY_SCOPE],
  });
  return google.searchconsole({ version: "v1", auth });
}

function isPrivatePath(pathname: string): boolean {
  return [
    "/api/",
    "/office/",
    "/admin/",
    "/customer/",
    "/dashboard/",
    "/account/",
    "/auth/",
    "/login",
    "/signup",
    "/cleaner/dashboard",
    "/cleaner/profile",
    "/cleaner/earnings",
    "/cleaner/schedule",
  ].some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

export function classifyGscPageUrl(pageUrl: string, siteUrl: string): SiteGscPageGroup | null {
  try {
    const page = new URL(pageUrl);
    const site = new URL(siteUrl);
    if (page.hostname !== site.hostname) return null;

    const pathname = page.pathname.replace(/\/+$/, "") || "/";
    if (isPrivatePath(pathname)) return null;
    if (pathname === "/cleaner/apply/form") return null;
    if (pathname === "/cleaner/apply" || pathname.startsWith("/careers")) return "recruitment";
    if (pathname === "/services" || pathname.startsWith("/services/")) return "service";
    if (pathname === "/blog" || pathname.startsWith("/blog/")) return "blog";
    if (pathname === "/locations" || pathname.startsWith("/locations/")) return "location";
    return "core";
  } catch {
    return null;
  }
}

async function fetchWholeSitePagePerformance(
  credentials: GscCredentials,
  range: GscDateRange,
): Promise<SiteGscApiRow[]> {
  const client = createSearchConsoleClient(credentials);
  const rowsOut: SiteGscApiRow[] = [];
  let startRow = 0;

  for (;;) {
    const res = await client.searchanalytics.query({
      siteUrl: credentials.siteUrl,
      requestBody: {
        startDate: range.startDate,
        endDate: range.endDate,
        dimensions: ["page"],
        rowLimit: PAGE_ROW_LIMIT,
        startRow,
      },
    });

    const rows = res.data.rows ?? [];
    for (const row of rows) {
      const pageUrl = row.keys?.[0]?.trim();
      if (!pageUrl) continue;
      rowsOut.push({
        pageUrl,
        clicks: typeof row.clicks === "number" ? row.clicks : 0,
        impressions: typeof row.impressions === "number" ? row.impressions : 0,
        ctr: typeof row.ctr === "number" ? row.ctr : 0,
        avgPosition: typeof row.position === "number" && Number.isFinite(row.position) ? row.position : null,
      });
    }

    if (rows.length < PAGE_ROW_LIMIT) break;
    startRow += rows.length;
    if (startRow > 100_000) break;
  }

  return rowsOut;
}

function mapSiteRows(
  current: SiteGscApiRow[],
  previous: SiteGscApiRow[],
  siteUrl: string,
): SiteGscMetricRow[] {
  const prevByUrl = new Map(previous.map((row) => [row.pageUrl, row]));
  const syncedAt = new Date().toISOString();

  return current.flatMap((row) => {
    const pageGroup = classifyGscPageUrl(row.pageUrl, siteUrl);
    if (!pageGroup) return [];
    const prev = prevByUrl.get(row.pageUrl);
    return [{
      page_url: row.pageUrl,
      page_group: pageGroup,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      avg_position: row.avgPosition,
      prev_clicks: prev?.clicks ?? 0,
      prev_impressions: prev?.impressions ?? 0,
      prev_avg_position: prev?.avgPosition ?? null,
      synced_at: syncedAt,
    }];
  });
}

export async function runSiteGscSync(admin: SupabaseClient): Promise<SiteGscSyncSummary> {
  const credentials = readGscCredentials();
  if (!credentials) {
    return {
      ok: false,
      rowsFetched: 0,
      rowsMatched: 0,
      rowsSaved: 0,
      startDate: "",
      endDate: "",
      siteUrl: null,
      error: "Missing GSC_CLIENT_EMAIL, GSC_PRIVATE_KEY, or GSC_SITE_URL.",
    };
  }

  const days = readGscSyncDays();
  const range = buildGscDateRange(days);
  const previousRange = buildGscPreviousDateRange(days);

  try {
    const [current, previous] = await Promise.all([
      fetchWholeSitePagePerformance(credentials, range),
      fetchWholeSitePagePerformance(credentials, previousRange),
    ]);
    const metrics = mapSiteRows(current, previous, credentials.siteUrl);

    if (metrics.length === 0) {
      return {
        ok: true,
        rowsFetched: current.length,
        rowsMatched: 0,
        rowsSaved: 0,
        startDate: range.startDate,
        endDate: range.endDate,
        siteUrl: credentials.siteUrl,
      };
    }

    const { error } = await admin.from("site_gsc_metrics").upsert(metrics, { onConflict: "page_url" });
    if (error) {
      return {
        ok: false,
        rowsFetched: current.length,
        rowsMatched: metrics.length,
        rowsSaved: 0,
        startDate: range.startDate,
        endDate: range.endDate,
        siteUrl: credentials.siteUrl,
        error: error.code === "42P01"
          ? "site_gsc_metrics table missing — apply the whole-site GSC migration."
          : error.message,
      };
    }

    return {
      ok: true,
      rowsFetched: current.length,
      rowsMatched: metrics.length,
      rowsSaved: metrics.length,
      startDate: range.startDate,
      endDate: range.endDate,
      siteUrl: credentials.siteUrl,
    };
  } catch (err) {
    return {
      ok: false,
      rowsFetched: 0,
      rowsMatched: 0,
      rowsSaved: 0,
      startDate: range.startDate,
      endDate: range.endDate,
      siteUrl: credentials.siteUrl,
      error: describeGscConfigError(err, credentials.siteUrl),
    };
  }
}

export async function loadSiteGscPageGroups(admin: SupabaseClient) {
  const { data, error } = await admin
    .from("site_gsc_metrics")
    .select("page_url,page_group,clicks,impressions,ctr,avg_position,prev_clicks,prev_impressions,prev_avg_position,synced_at")
    .order("impressions", { ascending: false });

  if (error || !data) {
    return { rows: [], groups: [], syncedAt: null, error: error?.message ?? null };
  }

  const groupMap = new Map<SiteGscPageGroup, {
    page_group: SiteGscPageGroup;
    pages: number;
    clicks: number;
    impressions: number;
    weighted_position_sum: number;
    position_impressions: number;
  }>();

  let syncedAt: string | null = null;
  for (const row of data as SiteGscMetricRow[]) {
    if (!syncedAt || row.synced_at > syncedAt) syncedAt = row.synced_at;
    const current = groupMap.get(row.page_group) ?? {
      page_group: row.page_group,
      pages: 0,
      clicks: 0,
      impressions: 0,
      weighted_position_sum: 0,
      position_impressions: 0,
    };
    current.pages += 1;
    current.clicks += row.clicks;
    current.impressions += row.impressions;
    if (row.avg_position != null && row.impressions > 0) {
      current.weighted_position_sum += row.avg_position * row.impressions;
      current.position_impressions += row.impressions;
    }
    groupMap.set(row.page_group, current);
  }

  const groups = [...groupMap.values()].map((group) => ({
    page_group: group.page_group,
    pages: group.pages,
    clicks: group.clicks,
    impressions: group.impressions,
    ctr: group.impressions > 0 ? group.clicks / group.impressions : 0,
    avg_position: group.position_impressions > 0
      ? group.weighted_position_sum / group.position_impressions
      : null,
  }));

  return { rows: data, groups, syncedAt, error: null };
}
