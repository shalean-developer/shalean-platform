/**
 * Next.js `htmlLimitedBots` — UAs that receive **blocking** metadata in `<head>`
 * instead of streamed metadata appended to `<body>`.
 *
 * ## Why this exists
 * Async `generateMetadata` on force-dynamic blog routes can resolve after the HTML
 * shell flushes. For UAs that are allowed to stream metadata, Next closes `</head>`
 * early (charset/viewport/preloads only) and emits title/robots/canonical later in
 * the body. Under concurrent crawl load that late tag often lands past the live SEO
 * scanner's first 180_000 characters, so CI reports `missing <link rel="canonical">`
 * even though the tag exists deeper in the document.
 *
 * Next's default list intentionally excludes plain `Googlebot` (DOM/JS bot) and does
 * not include our live SEO crawler. Setting `htmlLimitedBots` **replaces** the
 * default list, so we re-include Next's pattern and add both.
 *
 * Keep in sync with `next/dist/shared/lib/router/utils/html-bots.js` when upgrading Next.
 *
 * @see https://nextjs.org/docs/app/api-reference/config/next-config-js/htmlLimitedBots
 */

/** Source string from Next.js `HTML_LIMITED_BOT_UA_RE` (html-bots.js). */
export const NEXT_DEFAULT_HTML_LIMITED_BOTS_SOURCE =
  String.raw`[\w-]+-Google|Google-[\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight`;

/**
 * Extra UAs that must block metadata into `<head>`:
 * - `Googlebot` — Next treats it as a DOM bot and streams by default
 * - `ShaleanLiveSeoCrawl` — CI / live SEO validator user-agent
 */
export const SHALEAN_HTML_LIMITED_BOTS_EXTRA_SOURCE = String.raw`Googlebot|ShaleanLiveSeoCrawl`;

/** RegExp passed to `next.config.ts` → `htmlLimitedBots`. */
export const HTML_LIMITED_BOTS = new RegExp(
  `(?:${NEXT_DEFAULT_HTML_LIMITED_BOTS_SOURCE})|(?:${SHALEAN_HTML_LIMITED_BOTS_EXTRA_SOURCE})`,
  "i",
);

/** True when Next should block metadata into `<head>` for this User-Agent. */
export function shouldBlockStreamingMetadataForUserAgent(userAgent: string): boolean {
  return Boolean(userAgent) && HTML_LIMITED_BOTS.test(userAgent);
}
