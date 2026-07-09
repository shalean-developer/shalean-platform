import "server-only";

import { google } from "googleapis";
import type {
  GscCredentials,
  GscDailyPerformanceRow,
  GscDateRange,
  GscPagePerformanceRow,
  GscQueryPagePerformanceRow,
} from "@/lib/gsc/gsc-config";
import { describeGscConfigError } from "@/lib/gsc/gsc-config";

const GSC_READONLY_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const PAGE_ROW_LIMIT = 25_000;

export class GscSearchConsoleError extends Error {
  readonly code: "missing_credentials" | "api_error";

  constructor(code: "missing_credentials" | "api_error", message: string) {
    super(message);
    this.code = code;
    this.name = "GscSearchConsoleError";
  }
}

function createSearchConsoleClient(credentials: GscCredentials) {
  const auth = new google.auth.JWT({
    email: credentials.clientEmail,
    key: credentials.privateKey,
    scopes: [GSC_READONLY_SCOPE],
  });
  return google.searchconsole({ version: "v1", auth });
}

function parseApiRow(row: {
  keys?: string[] | null;
  clicks?: number | null;
  impressions?: number | null;
  ctr?: number | null;
  position?: number | null;
}): GscPagePerformanceRow | null {
  const pageUrl = row.keys?.[0]?.trim();
  if (!pageUrl) return null;
  return {
    pageUrl,
    clicks: typeof row.clicks === "number" ? row.clicks : 0,
    impressions: typeof row.impressions === "number" ? row.impressions : 0,
    ctr: typeof row.ctr === "number" ? row.ctr : 0,
    avgPosition: typeof row.position === "number" && Number.isFinite(row.position) ? row.position : null,
  };
}

/** Fetch Search Console performance grouped by page for `/locations/` hubs. */
export async function fetchGscPagePerformance(
  credentials: GscCredentials,
  range: GscDateRange,
): Promise<GscPagePerformanceRow[]> {
  let client;
  try {
    client = createSearchConsoleClient(credentials);
  } catch (err) {
    throw new GscSearchConsoleError(
      "api_error",
      describeGscConfigError(err, credentials.siteUrl),
    );
  }

  const out: GscPagePerformanceRow[] = [];
  let startRow = 0;

  try {
    for (;;) {
      const res = await client.searchanalytics.query({
        siteUrl: credentials.siteUrl,
        requestBody: {
          startDate: range.startDate,
          endDate: range.endDate,
          dimensions: ["page"],
          rowLimit: PAGE_ROW_LIMIT,
          startRow,
          dimensionFilterGroups: [
            {
              filters: [
                {
                  dimension: "page",
                  operator: "contains",
                  expression: "/locations/",
                },
              ],
            },
          ],
        },
      });

      const rows = res.data.rows ?? [];
      for (const row of rows) {
        const parsed = parseApiRow(row);
        if (parsed) out.push(parsed);
      }

      if (rows.length < PAGE_ROW_LIMIT) break;
      startRow += rows.length;
      if (startRow > 100_000) break;
    }
  } catch (err) {
    throw new GscSearchConsoleError(
      "api_error",
      describeGscConfigError(err, credentials.siteUrl),
    );
  }

  return out;
}

function parseQueryPageRow(row: {
  keys?: string[] | null;
  clicks?: number | null;
  impressions?: number | null;
  ctr?: number | null;
  position?: number | null;
}): GscQueryPagePerformanceRow | null {
  const query = row.keys?.[0]?.trim();
  const pageUrl = row.keys?.[1]?.trim();
  if (!query || !pageUrl) return null;
  return {
    query,
    pageUrl,
    clicks: typeof row.clicks === "number" ? row.clicks : 0,
    impressions: typeof row.impressions === "number" ? row.impressions : 0,
    ctr: typeof row.ctr === "number" ? row.ctr : 0,
    avgPosition: typeof row.position === "number" && Number.isFinite(row.position) ? row.position : null,
  };
}

/** Fetch Search Console performance grouped by query + page for `/locations/` hubs. */
export async function fetchGscQueryPagePerformance(
  credentials: GscCredentials,
  range: GscDateRange,
): Promise<GscQueryPagePerformanceRow[]> {
  let client;
  try {
    client = createSearchConsoleClient(credentials);
  } catch (err) {
    throw new GscSearchConsoleError(
      "api_error",
      describeGscConfigError(err, credentials.siteUrl),
    );
  }

  const out: GscQueryPagePerformanceRow[] = [];
  let startRow = 0;

  try {
    for (;;) {
      const res = await client.searchanalytics.query({
        siteUrl: credentials.siteUrl,
        requestBody: {
          startDate: range.startDate,
          endDate: range.endDate,
          dimensions: ["query", "page"],
          rowLimit: PAGE_ROW_LIMIT,
          startRow,
          dimensionFilterGroups: [
            {
              filters: [
                {
                  dimension: "page",
                  operator: "contains",
                  expression: "/locations/",
                },
              ],
            },
          ],
        },
      });

      const rows = res.data.rows ?? [];
      for (const row of rows) {
        const parsed = parseQueryPageRow(row);
        if (parsed) out.push(parsed);
      }

      if (rows.length < PAGE_ROW_LIMIT) break;
      startRow += rows.length;
      if (startRow > 100_000) break;
    }
  } catch (err) {
    throw new GscSearchConsoleError(
      "api_error",
      describeGscConfigError(err, credentials.siteUrl),
    );
  }

  return out;
}

/** Daily clicks/impressions for `/locations/` hubs (used for dashboard sparkline). */
export async function fetchGscDailyLocationPerformance(
  credentials: GscCredentials,
  range: GscDateRange,
): Promise<GscDailyPerformanceRow[]> {
  let client;
  try {
    client = createSearchConsoleClient(credentials);
  } catch (err) {
    throw new GscSearchConsoleError(
      "api_error",
      describeGscConfigError(err, credentials.siteUrl),
    );
  }

  const byDate = new Map<string, GscDailyPerformanceRow>();

  try {
    const res = await client.searchanalytics.query({
      siteUrl: credentials.siteUrl,
      requestBody: {
        startDate: range.startDate,
        endDate: range.endDate,
        dimensions: ["date"],
        rowLimit: PAGE_ROW_LIMIT,
        dimensionFilterGroups: [
          {
            filters: [
              {
                dimension: "page",
                operator: "contains",
                expression: "/locations/",
              },
            ],
          },
        ],
      },
    });

    for (const row of res.data.rows ?? []) {
      const date = row.keys?.[0]?.trim();
      if (!date) continue;
      byDate.set(date, {
        date,
        clicks: typeof row.clicks === "number" ? row.clicks : 0,
        impressions: typeof row.impressions === "number" ? row.impressions : 0,
      });
    }
  } catch (err) {
    throw new GscSearchConsoleError(
      "api_error",
      describeGscConfigError(err, credentials.siteUrl),
    );
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
