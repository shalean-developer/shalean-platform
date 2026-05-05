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
       * Canonical host: apex `https://shalean.co.za`. `www.shalean.co.za` → apex (backup if DNS/Vercel redirect differs).
       * Next uses **308** for `permanent: true` (same semantics as 301 for SEO; method/body preserved).
       */
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.shalean.co.za" }],
        destination: "https://shalean.co.za/:path*",
        permanent: true,
      },
      /**
       * Legacy `.com` → canonical apex `.co.za` with path + query preserved.
       */
      {
        source: "/:path*",
        has: [{ type: "host", value: "shalean.com" }],
        destination: "https://shalean.co.za/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.shalean.com" }],
        destination: "https://shalean.co.za/:path*",
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
       * Legacy `/cleaning-services/:slug` URLs are handled only in `middleware.ts` so slugs already ending in
       * `-cleaning-services` are never double-suffixed. Unknown slugs redirect to `/locations`.
       */
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
