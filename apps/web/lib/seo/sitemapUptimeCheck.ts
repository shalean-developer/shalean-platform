export type SitemapUptimeResult =
  | { ok: true; url: string; status: number; urlCount: number }
  | { ok: false; url: string; status: number | null; reason: string };

/** Parse `<loc>` count from sitemap XML (minimal sanity check beyond HTTP 200). */
export function countSitemapLocs(body: string): number {
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let count = 0;
  while (re.exec(body) !== null) count += 1;
  return count;
}

export function validateSitemapResponse(status: number, body: string, url: string): SitemapUptimeResult {
  if (status !== 200) {
    return { ok: false, url, status, reason: `Expected HTTP 200, got ${status}` };
  }
  const trimmed = body.trim();
  if (!trimmed.includes("<urlset") && !trimmed.includes(":urlset")) {
    return { ok: false, url, status, reason: "Response body is not a sitemap urlset" };
  }
  const urlCount = countSitemapLocs(trimmed);
  if (urlCount < 1) {
    return { ok: false, url, status, reason: "Sitemap contains zero <loc> entries" };
  }
  return { ok: true, url, status, urlCount };
}
