/**
 * Live internal-link audit — crawls rendered HTML on key indexable pages.
 *
 * Requires AUDIT_BASE_URL (defaults to https://shalean.co.za).
 *
 * `npm run validate:live-internal-links`
 *
 * Fails when same-origin links on seed pages resolve to 404, 410, or 5xx.
 */

import {
  extractSameOriginLinks,
  fetchWithNoRedirect,
  isBrokenInternalLinkStatus,
  LIVE_INTERNAL_LINK_SEED_PATHS,
  probePathStatus,
  resolveAuditBaseUrl,
  shouldSkipLiveInternalLinkTarget,
} from "@/lib/seo/liveSeoCrawl";

const baseEnv = resolveAuditBaseUrl(process.env.AUDIT_BASE_URL);
const concurrency = Math.min(12, Math.max(1, parseInt(process.env.LIVE_SEO_CONCURRENCY ?? "6", 10) || 6));
const maxLinks = Math.min(500, Math.max(20, parseInt(process.env.LIVE_INTERNAL_LINK_MAX ?? "250", 10) || 250));

function parseSeedPaths(): string[] {
  const raw = process.env.LIVE_INTERNAL_LINK_SEEDS?.trim();
  if (!raw) return [...LIVE_INTERNAL_LINK_SEED_PATHS];
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.startsWith("/") ? s : `/${s}`));
}

async function main(): Promise<void> {
  const seeds = parseSeedPaths();
  console.log(`[validate-live-internal-links] Base ${baseEnv}`);
  console.log(`[validate-live-internal-links] Seed pages (${seeds.length})`);

  const linkSources = new Map<string, Set<string>>();
  const failures: string[] = [];

  for (const path of seeds) {
    const pageUrl = `${baseEnv}${path}`;
    const res = await fetchWithNoRedirect(pageUrl);
    if (res.status !== 200) {
      failures.push(`seed ${pageUrl} → HTTP ${res.status} (cannot crawl links)`);
      continue;
    }
    for (const link of extractSameOriginLinks(res.body, pageUrl)) {
      if (shouldSkipLiveInternalLinkTarget(new URL(link).pathname)) continue;
      const bucket = linkSources.get(link) ?? new Set<string>();
      bucket.add(path);
      linkSources.set(link, bucket);
    }
  }

  const targets = [...linkSources.keys()].slice(0, maxLinks);
  console.log(`[validate-live-internal-links] Unique internal targets (${targets.length} of ${linkSources.size})`);

  let idx = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = idx++;
      if (i >= targets.length) return;
      const url = targets[i]!;
      const status = await probePathStatus(url);
      if (isBrokenInternalLinkStatus(status)) {
        const from = [...(linkSources.get(url) ?? [])].slice(0, 4).join(", ");
        failures.push(`${url} → HTTP ${status || "error"} (linked from ${from || "?"})`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  if (failures.length) {
    console.error(`[validate-live-internal-links] FAILED (${failures.length} broken links)\n`);
    for (const f of failures.slice(0, 80)) console.error(`  ${f}`);
    if (failures.length > 80) console.error(`  … ${failures.length - 80} more`);
    process.exit(1);
  }

  console.log("[validate-live-internal-links] OK — no 404/410/5xx on crawled internal links");
}

void main();

export {};
