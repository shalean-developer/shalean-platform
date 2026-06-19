import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";
import { loadLocationSeoFeedbackJsonForNextEnv } from "./lib/seo/load-location-seo-feedback-env";
import { programmaticBlogCleanupRedirects } from "./lib/seo/programmaticBlogCleanupRedirects";

const turbopackRoot = path.dirname(fileURLToPath(import.meta.url));
const locationSeoFeedbackJson = loadLocationSeoFeedbackJsonForNextEnv(turbopackRoot);

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

/**
 * Phase 4 cutover redirects — toggle via ENABLE_PORTAL_REDIRECTS=1 env var.
 * Set to "1" in production Vercel once each portal reaches full parity.
 *
 * /dashboard  → /account   (customer portal)
 * /cleaner    → /jobs       (cleaner workspace)  
 * /admin      → /office     (admin console)
 */
function portalCutoverRedirects() {
  if (process.env.ENABLE_PORTAL_REDIRECTS !== "1") return [];
  return [
    {
      source: "/dashboard",
      destination: "/account",
      permanent: false,
    },
    {
      source: "/dashboard/:path*",
      destination: "/account/:path*",
      permanent: false,
    },
    {
      source: "/cleaner/dashboard",
      destination: "/jobs",
      permanent: false,
    },
    {
      source: "/cleaner/dashboard/:path*",
      destination: "/jobs/:path*",
      permanent: false,
    },
    {
      source: "/admin",
      destination: "/office",
      permanent: false,
    },
    {
      source: "/admin/:path*",
      destination: "/office/:path*",
      permanent: false,
    },
  ];
}

const nextConfig: NextConfig = {
  ...(locationSeoFeedbackJson
    ? {
        env: {
          LOCATION_SEO_FEEDBACK_JSON: locationSeoFeedbackJson,
        },
      }
    : {}),
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.shalean.co.za" }],
        destination: "https://shalean.co.za/:path*",
        permanent: true,
      },
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
      ...programmaticBlogCleanupRedirects,
      {
        source: "/dashboard/bookings",
        destination: "/account/bookings",
        permanent: false,
      },
      {
        source: "/dashboard/bookings/:id",
        destination: "/account/bookings/:id",
        permanent: false,
      },
      {
        source: "/booking/success",
        destination: "/account/success",
        permanent: false,
      },
      /** Cleaner workspace cutover — always redirect legacy UI paths to `/jobs`. */
      {
        source: "/cleaner",
        destination: "/jobs",
        permanent: false,
      },
      {
        source: "/cleaner/dashboard",
        destination: "/jobs",
        permanent: false,
      },
      {
        source: "/cleaner/dashboard/:path*",
        destination: "/jobs/:path*",
        permanent: false,
      },
      {
        source: "/cleaner/jobs",
        destination: "/jobs/list",
        permanent: false,
      },
      {
        source: "/cleaner/jobs/:id",
        destination: "/jobs/job/:id",
        permanent: false,
      },
      {
        source: "/cleaner/earnings",
        destination: "/jobs/earnings",
        permanent: false,
      },
      {
        source: "/cleaner/earnings/:path*",
        destination: "/jobs/earnings/:path*",
        permanent: false,
      },
      {
        source: "/cleaner/profile",
        destination: "/jobs/profile",
        permanent: false,
      },
      {
        source: "/cleaner/profile/:path*",
        destination: "/jobs/profile/:path*",
        permanent: false,
      },
      {
        source: "/admin/cleaners/manage",
        destination: "/office/cleaners",
        permanent: false,
      },
      {
        source: "/admin/cleaners/manage/:path*",
        destination: "/office/cleaners",
        permanent: false,
      },
      {
        source: "/office/cleaners/manage",
        destination: "/office/cleaners",
        permanent: false,
      },
      {
        source: "/office/cleaners/manage/:path*",
        destination: "/office/cleaners",
        permanent: false,
      },
      ...portalCutoverRedirects(),
    ];
  },
  images: {
    remotePatterns: imageRemotePatterns,
    localPatterns: [{ pathname: "/images/**" }, { pathname: "/marketing/**" }],
  },
  turbopack: {
    root: turbopackRoot,
  },
};

export default nextConfig;