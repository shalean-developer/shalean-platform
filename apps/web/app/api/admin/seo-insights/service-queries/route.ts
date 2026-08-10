import { NextResponse } from "next/server";
import { google } from "googleapis";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { buildGscDateRange, readGscCredentials, readGscSyncDays } from "@/lib/gsc/gsc-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const credentials = readGscCredentials();
  if (!credentials) return NextResponse.json({ error: "Google Search Console is not configured." }, { status: 503 });
  const range = buildGscDateRange(readGscSyncDays());
  try {
    const jwt = new google.auth.JWT({ email: credentials.clientEmail, key: credentials.privateKey, scopes: ["https://www.googleapis.com/auth/webmasters.readonly"] });
    const client = google.searchconsole({ version: "v1", auth: jwt });
    const res = await client.searchanalytics.query({
      siteUrl: credentials.siteUrl,
      requestBody: {
        startDate: range.startDate,
        endDate: range.endDate,
        dimensions: ["page", "query"],
        rowLimit: 25000,
        dimensionFilterGroups: [{ filters: [{ dimension: "page", operator: "contains", expression: "/services/" }] }],
      },
    });
    const rows = (res.data.rows ?? []).flatMap((row) => {
      const pageUrl = row.keys?.[0]?.trim(); const query = row.keys?.[1]?.trim();
      if (!pageUrl || !query) return [];
      return [{ page_url: pageUrl, query, clicks: row.clicks ?? 0, impressions: row.impressions ?? 0, ctr: row.ctr ?? 0, avg_position: row.position ?? null }];
    }).sort((a,b) => b.impressions - a.impressions);
    return NextResponse.json({ startDate: range.startDate, endDate: range.endDate, rows });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "GSC query request failed." }, { status: 502 });
  }
}
