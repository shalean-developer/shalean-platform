import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  HTML_LIMITED_BOTS,
  NEXT_DEFAULT_HTML_LIMITED_BOTS_SOURCE,
  shouldBlockStreamingMetadataForUserAgent,
} from "@/lib/seo/htmlLimitedBots";
import {
  extractCanonicalHref,
  LIVE_SEO_CRAWL_USER_AGENT,
  LIVE_SEO_HTML_SCAN_CHARS,
} from "@/lib/seo/liveSeoCrawl";
import { shouldServeStreamingMetadata } from "next/dist/server/lib/streaming-metadata";
import { HTML_LIMITED_BOT_UA_RE } from "next/dist/shared/lib/router/utils/html-bots";

const GOOGLEBOT_UA =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const BINGBOT_UA =
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)";
const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

describe("htmlLimitedBots — streaming metadata regression", () => {
  it("keeps Next's default bot source in sync with the installed next package", () => {
    expect(NEXT_DEFAULT_HTML_LIMITED_BOTS_SOURCE).toBe(HTML_LIMITED_BOT_UA_RE.source);
  });

  it("Next defaults stream metadata for Googlebot and ShaleanLiveSeoCrawl (failure mode)", () => {
    // Documents why Production + CI intermittently miss <head> canonical under load:
    // these UAs are allowed to stream async generateMetadata into <body>.
    expect(shouldServeStreamingMetadata(GOOGLEBOT_UA, HTML_LIMITED_BOT_UA_RE.source)).toBe(true);
    expect(shouldServeStreamingMetadata(LIVE_SEO_CRAWL_USER_AGENT, HTML_LIMITED_BOT_UA_RE.source)).toBe(
      true,
    );
    expect(shouldServeStreamingMetadata(BINGBOT_UA, HTML_LIMITED_BOT_UA_RE.source)).toBe(false);
  });

  it("Shalean htmlLimitedBots blocks streaming for Googlebot and the live SEO crawler", () => {
    const pattern = HTML_LIMITED_BOTS.source;
    expect(shouldServeStreamingMetadata(GOOGLEBOT_UA, pattern)).toBe(false);
    expect(shouldServeStreamingMetadata(LIVE_SEO_CRAWL_USER_AGENT, pattern)).toBe(false);
    expect(shouldServeStreamingMetadata(BINGBOT_UA, pattern)).toBe(false);
    // Regular browsers may still stream — TTFB tradeoff preserved.
    expect(shouldServeStreamingMetadata(CHROME_UA, pattern)).toBe(true);

    expect(shouldBlockStreamingMetadataForUserAgent(GOOGLEBOT_UA)).toBe(true);
    expect(shouldBlockStreamingMetadataForUserAgent(LIVE_SEO_CRAWL_USER_AGENT)).toBe(true);
    expect(shouldBlockStreamingMetadataForUserAgent(CHROME_UA)).toBe(false);
  });

  it("next.config.ts wires htmlLimitedBots from the shared module", () => {
    const configPath = path.join(__dirname, "../../../next.config.ts");
    const src = readFileSync(configPath, "utf8");
    expect(src).toMatch(/htmlLimitedBots:\s*HTML_LIMITED_BOTS/);
    expect(src).toMatch(/from\s+["']\.\/lib\/seo\/htmlLimitedBots["']/);
  });

  it("reproduces live-SEO false miss when canonical only appears after the scan window", () => {
    // Captured Production failure shape: early </head> shell, streamed metadata deep in body.
    const earlyHead = `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/><meta name="theme-color" content="#fff"/></head><body>`;
    const padding = "x".repeat(LIVE_SEO_HTML_SCAN_CHARS - earlyHead.length + 1000);
    const lateCanonical = `<link rel="canonical" href="https://shalean.co.za/blog/speed-cleaning-routine"/>`;
    const streamedHtml = `${earlyHead}${padding}${lateCanonical}</body></html>`;

    expect(streamedHtml.indexOf("rel=\"canonical\"")).toBeGreaterThan(LIVE_SEO_HTML_SCAN_CHARS);
    expect(extractCanonicalHref(streamedHtml)).toBeNull();

    const blockedHeadHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"/><link rel="canonical" href="https://shalean.co.za/blog/speed-cleaning-routine"/><title>Speed cleaning</title></head><body>${padding}</body></html>`;
    expect(extractCanonicalHref(blockedHeadHtml)).toBe(
      "https://shalean.co.za/blog/speed-cleaning-routine",
    );
  });
});
