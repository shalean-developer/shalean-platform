import "server-only";

import { google } from "googleapis";
import type { GscCredentials, GscDateRange, GscPagePerformanceRow } from "@/lib/gsc/gsc-config";
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
