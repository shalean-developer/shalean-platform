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
 * Customer portal cutover — legacy `/dashboard/*` → `/account/*`.
 * Cleaner and admin cutovers are handled separately below.
 */
function portalCutoverRedirects() {
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
  ];
}

const nextConfig: NextConfig = {
  serverExternalPackages: ["googleapis", "google-auth-library"],
  poweredByHeader: false,
  typescript: {
    // Types are enforced by `npm run typecheck` (CI + local). Skipping the second full-program
    // pass inside `next build` avoids OOM on large trees when the default ~4GB heap is exhausted.
    ignoreBuildErrors: true,
  },
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
      {
        source: "/services/standard-cleaning",
        destination: "/services/standard-cleaning-cape-town",
        permanent: true,
      },
      {
        source: "/services/deep-cleaning",
        destination: "/services/deep-cleaning-cape-town",
        permanent: true,
      },
      {
        source: "/services/move-in-out-cleaning",
        destination: "/services/move-out-cleaning-cape-town",
        permanent: true,
      },
      {
        source: "/services/office-cleaning",
        destination: "/services/office-cleaning-cape-town",
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
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
      {
        source: "/(office|login|admin)(.*)",
        headers: [{ key: "X-Frame-Options", value: "DENY" }],
      },
      {
        source: "/:all*(svg|jpg|jpeg|png|webp|avif|gif|ico|woff|woff2)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
  images: {
    remotePatterns: imageRemotePatterns,
    localPatterns: [{ pathname: "/images/**" }, { pathname: "/marketing/**" }],
    formats: ["image/avif", "image/webp"],
    deviceSizes: [360, 480, 640, 768, 828, 1080, 1200, 1440, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 2678400,
  },
  turbopack: {
    root: turbopackRoot,
  },
};

export default nextConfig;