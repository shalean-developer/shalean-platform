import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron/verifyCronSecret";
import { logCronRun } from "@/lib/logging/systemLog";
import { validateRobotsResponse } from "@/lib/seo/robotsHealthCheck";
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

async function fetchText(url: string, accept: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      cache: "no-store",
      headers: { "user-agent": "ShaleanSeoHealth/1.0", accept },
    });
    return { status: response.status, body: response.status === 200 ? await response.text() : "" };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: Request) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const origin = siteOrigin();
  const sitemapUrl = `${origin}/sitemap.xml`;
  const robotsUrl = `${origin}/robots.txt`;

  try {
    const [sitemapResponse, robotsResponse] = await Promise.all([
      fetchText(sitemapUrl, "application/xml,text/xml,*/*;q=0.8"),
      fetchText(robotsUrl, "text/plain,*/*;q=0.8"),
    ]);

    const sitemap = validateSitemapResponse(sitemapResponse.status, sitemapResponse.body, sitemapUrl);
    const robots = validateRobotsResponse(robotsResponse.status, robotsResponse.body, robotsUrl, sitemapUrl);

    if (!sitemap.ok || !robots.ok) {
      const errors = [!sitemap.ok ? sitemap.reason : null, !robots.ok ? robots.reason : null].filter(Boolean);
      await logCronRun({
        jobName: "sitemap-health",
        status: "error",
        message: errors.join(" | "),
        context: {
          sitemap_http_status: sitemap.status,
          robots_http_status: robots.status,
          sitemap_error: !sitemap.ok ? sitemap.reason : null,
          robots_error: !robots.ok ? robots.reason : null,
          error: errors.join(" | "),
        },
      });
      return NextResponse.json({ ok: false, sitemap, robots }, { status: 503 });
    }

    await logCronRun({
      jobName: "sitemap-health",
      status: "success",
      message: "Sitemap and robots health checks passed.",
      context: {
        http_status: sitemap.status,
        url_count: sitemap.urlCount,
        sitemap_http_status: sitemap.status,
        robots_http_status: robots.status,
        robots_allow_count: robots.allowCount,
        robots_disallow_count: robots.disallowCount,
      },
    });

    return NextResponse.json({ ok: true, sitemap, robots });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await logCronRun({
      jobName: "sitemap-health",
      status: "error",
      message: reason,
      context: { sitemap_url: sitemapUrl, robots_url: robotsUrl, error: reason },
    });
    return NextResponse.json({ ok: false, reason }, { status: 503 });
  }
}
