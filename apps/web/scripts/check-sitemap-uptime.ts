/**
 * Production sitemap uptime probe — fails CI/cron when `/sitemap.xml` is not healthy.
 *
 * `npm run check:sitemap-uptime`
 * Env: `AUDIT_BASE_URL` (default `https://shalean.co.za`)
 */

import { validateSitemapResponse } from "@/lib/seo/sitemapUptimeCheck";

const baseEnv = process.env.AUDIT_BASE_URL?.trim().replace(/\/+$/, "") || "https://shalean.co.za";
const timeoutMs = Math.min(60_000, Math.max(5_000, parseInt(process.env.SITEMAP_UPTIME_TIMEOUT_MS ?? "20000", 10) || 20_000));

async function main(): Promise<void> {
  const url = `${baseEnv}/sitemap.xml`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  let status: number | null = null;
  let body = "";

  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ac.signal,
      headers: {
        "user-agent": "ShaleanSitemapUptime/1.0",
        accept: "application/xml,text/xml,*/*;q=0.8",
      },
    });
    status = res.status;
    body = res.status === 200 ? await res.text() : "";
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[check-sitemap-uptime] FAILED ${url} — ${reason}`);
    process.exit(1);
  } finally {
    clearTimeout(timer);
  }

  const result = validateSitemapResponse(status ?? 0, body, url);
  if (!result.ok) {
    console.error(`[check-sitemap-uptime] FAILED ${result.url} — ${result.reason}`);
    process.exit(1);
  }

  console.log(`[check-sitemap-uptime] OK ${result.url} — HTTP ${result.status}, ${result.urlCount} URLs`);
}

void main();

export {};
