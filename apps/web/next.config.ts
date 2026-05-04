import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";
import { programmaticBlogCleanupRedirects } from "./lib/seo/programmaticBlogCleanupRedirects";

/** Absolute app root — required when a parent folder (e.g. `apps/web/package.json` shim) has its own lockfile and Turbopack would otherwise infer the wrong root. */
const turbopackRoot = path.dirname(fileURLToPath(import.meta.url));

function supabaseImageHost(): string | null {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return url ? new URL(url).hostname : null;
  } catch {
    return null;
  }
}

const supabaseHost = supabaseImageHost();

const imageRemotePatterns = [
  { protocol: "https" as const, hostname: "images.unsplash.com" },
  ...(supabaseHost ? [{ protocol: "https" as const, hostname: supabaseHost }] : []),
];

const nextConfig: NextConfig = {
  async redirects() {
    return [
      /**
       * Canonical host: `.co.za` only. Apex + `www` `.com` → `https://www.shalean.co.za` with path + query preserved.
       * Next uses **308** for `permanent: true` (same semantics as 301 for SEO; method/body preserved).
       */
      {
        source: "/:path*",
        has: [{ type: "host", value: "shalean.com" }],
        destination: "https://www.shalean.co.za/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.shalean.com" }],
        destination: "https://www.shalean.co.za/:path*",
        permanent: true,
      },
      {
        source: "/home-cleaning",
        destination: "/services/standard-cleaning-cape-town",
        permanent: true,
      },
      {
        source: "/deep-cleaning",
        destination: "/services/deep-cleaning-cape-town",
        permanent: true,
      },
      /**
       * Legacy flat location URLs (short suburb slug, e.g. `sea-point`).
       * `middleware.ts` resolves mapped suburbs via `locationSeoPathFromLegacyAreaSlug` (308);
       * this rule covers any remaining `/cleaning-services/:slug` hits as `/locations/:slug-cleaning-services`.
       */
      {
        source: "/cleaning-services/:slug",
        destination: "/locations/:slug-cleaning-services",
        permanent: true,
      },
      ...programmaticBlogCleanupRedirects,
    ];
  },
  images: {
    remotePatterns: imageRemotePatterns,
    /**
     * Next 16+ requires local `next/image` src paths to match here.
     * Omit `search` so optional `?v=` cache-bust query strings under `/images/**` are allowed.
     */
    localPatterns: [{ pathname: "/images/**" }, { pathname: "/marketing/**" }],
  },
  turbopack: {
    root: turbopackRoot,
  },
};

export default nextConfig;
