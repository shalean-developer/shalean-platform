import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron/verifyCronSecret";
import { logCronRun } from "@/lib/logging/systemLog";
import { validateSitemapResponse } from "@/lib/seo/sitemapUptimeCheck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_SITE_URL = "https://shalean.co.za";
const TIMEOUT_MS = 20_000;

function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || DEFAULT_SITE_URL)
    .trim()
    .replace(/\/+$/, "");
}

export async function GET(request: Request) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const url = `${siteOrigin()}/sitemap.xml`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "user-agent": "ShaleanSitemapHealth/1.0",
        accept: "application/xml,text/xml,*/*;q=0.8",
      },
    });
    const body = response.status === 200 ? await response.text() : "";
    const result = validateSitemapResponse(response.status, body, url);

    if (!result.ok) {
      await logCronRun({
        jobName: "sitemap-health",
        status: "error",
        message: result.reason,
        context: { url: result.url, http_status: result.status, error: result.reason },
      });
      return NextResponse.json(result, { status: 503 });
    }

    await logCronRun({
      jobName: "sitemap-health",
      status: "success",
      message: "Sitemap health check passed.",
      context: { url: result.url, http_status: result.status, url_count: result.urlCount },
    });

    return NextResponse.json(result);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await logCronRun({
      jobName: "sitemap-health",
      status: "error",
      message: reason,
      context: { url, error: reason },
    });
    return NextResponse.json({ ok: false, url, status: null, reason }, { status: 503 });
  } finally {
    clearTimeout(timer);
  }
}
