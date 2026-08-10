export type RobotsHealthResult =
  | { ok: true; url: string; status: number; sitemap: string; allowCount: number; disallowCount: number }
  | { ok: false; url: string; status: number | null; reason: string };

function normalizedLines(body: string): string[] {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"));
}

export function validateRobotsResponse(
  status: number,
  body: string,
  url: string,
  expectedSitemap: string,
): RobotsHealthResult {
  if (status !== 200) return { ok: false, url, status, reason: `Expected HTTP 200, got ${status}` };

  const lines = normalizedLines(body);
  if (!lines.some((line) => /^user-agent:\s*\*$/i.test(line))) {
    return { ok: false, url, status, reason: "Missing User-agent: * rule" };
  }

  const sitemapLine = lines.find((line) => /^sitemap:/i.test(line));
  if (!sitemapLine) return { ok: false, url, status, reason: "Missing Sitemap directive" };
  const sitemap = sitemapLine.replace(/^sitemap:\s*/i, "").trim();
  if (sitemap !== expectedSitemap) {
    return { ok: false, url, status, reason: `Unexpected sitemap directive: ${sitemap}` };
  }

  const allow = lines.filter((line) => /^allow:/i.test(line)).map((line) => line.replace(/^allow:\s*/i, "").trim());
  const disallow = lines.filter((line) => /^disallow:/i.test(line)).map((line) => line.replace(/^disallow:\s*/i, "").trim());

  const requiredDisallow = ["/admin", "/office", "/api", "/cleaner", "/payment", "/account", "/auth", "/login"];
  const missingDisallow = requiredDisallow.filter((path) => !disallow.includes(path));
  if (missingDisallow.length) {
    return { ok: false, url, status, reason: `Missing required Disallow rules: ${missingDisallow.join(", ")}` };
  }

  if (!allow.includes("/") || !allow.includes("/cleaner/apply$")) {
    return { ok: false, url, status, reason: "Missing required public Allow rules" };
  }

  if (disallow.includes("/")) {
    return { ok: false, url, status, reason: "Production robots.txt blocks the entire site" };
  }

  return { ok: true, url, status, sitemap, allowCount: allow.length, disallowCount: disallow.length };
}
