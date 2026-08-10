import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron/verifyCronSecret";
import { logCronRun } from "@/lib/logging/systemLog";
import { validateRobotsResponse } from "@/lib/seo/robotsHealthCheck";
import { SITE_ORIGIN } from "@/lib/site/canonical";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 20_000;

export async function GET(request: Request) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status });

  const url = `${SITE_ORIGIN}/robots.txt`;
  const expectedSitemap = `${SITE_ORIGIN}/sitemap.xml`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "user-agent": "ShaleanRobotsHealth/1.0",
        accept: "text/plain,*/*;q=0.8",
      },
    });
    const body = response.status === 200 ? await response.text() : "";
    const result = validateRobotsResponse(response.status, body, url, expectedSitemap);

    if (!result.ok) {
      await logCronRun({
        jobName: "robots-health",
        status: "error",
        message: result.reason,
        context: { url: result.url, http_status: result.status, error: result.reason },
      });
      return NextResponse.json(result, { status: 503 });
    }

    await logCronRun({
      jobName: "robots-health",
      status: "success",
      message: "Robots health check passed.",
      context: {
        url: result.url,
        http_status: result.status,
        sitemap: result.sitemap,
        allow_count: result.allowCount,
        disallow_count: result.disallowCount,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await logCronRun({
      jobName: "robots-health",
      status: "error",
      message: reason,
      context: { url, error: reason },
    });
    return NextResponse.json({ ok: false, url, status: null, reason }, { status: 503 });
  } finally {
    clearTimeout(timer);
  }
}
