import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";
import { collectEnvironmentSafetyIssues } from "./lib/env/assertEnvironmentSafety";
import { HTML_LIMITED_BOTS } from "./lib/seo/htmlLimitedBots";
import { loadLocationSeoFeedbackJsonForNextEnv } from "./lib/seo/load-location-seo-feedback-env";
import { programmaticBlogCleanupRedirects } from "./lib/seo/programmaticBlogCleanupRedirects";

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(appRoot, "../..");
const locationSeoFeedbackJson = loadLocationSeoFeedbackJsonForNextEnv(appRoot);

/** Fail closed on Vercel (or when explicitly enabled) if Paystack/DB env mapping is unsafe. */
{
  const enforce =
    process.env.VERCEL === "1" || process.env.SHALEAN_ENFORCE_ENV_SAFETY === "true";
  if (enforce) {
    const fatal = collectEnvironmentSafetyIssues(process.env).filter((issue) =>
      [
        "paystack_live_in_non_production",
        "paystack_test_in_production",
        "supabase_ref_mismatch",
        "paystack_public_secret_mismatch",
      ].includes(issue.code),
    );
    if (fatal.length > 0) {
      throw new Error(
        `[shalean-env-safety] ${fatal.map((f) => f.message).join(" | ")}`,
      );
    }
  }
}

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
  // Keep Next's file tracing and bundler rooted at the same monorepo directory. Vercel
  // traces from the repository root, and warns when Turbopack uses apps/web instead.
  outputFileTracingRoot: workspaceRoot,
  // Local workspace packages ship TypeScript source; Next must transpile them.
  transpilePackages: ["@shalean/utils", "@shalean/types", "@shalean/validation", "@shalean/api-client"],
  serverExternalPackages: ["googleapis", "google-auth-library"],
  poweredByHeader: false,
  /**
   * Force blocking `<head>` metadata for Googlebot + live SEO crawler (plus Next defaults).
   * Without this, concurrent blog crawls intermittently stream canonical into `<body>`
   * past the live SEO 180k scan window. See `lib/seo/htmlLimitedBots.ts`.
   */
  htmlLimitedBots: HTML_LIMITED_BOTS,
  typescript: {
    // Types are enforced by `npm run typecheck` (CI + local). Skipping the second full-program
    // pass inside `next build` avoids OOM on large trees when the default ~4GB heap is exhausted.
    ignoreBuildErrors: true,
  },
  experimental: {
    // The application is close to the 8 GB Vercel build-machine limit. Next.js 15+
    // provides lower-memory Webpack behavior specifically for large production builds.
    webpackMemoryOptimizations: true,
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
      /** Common legacy / mistyped paths that previously 404'd. */
      {
        source: "/careers",
        destination: "/cleaner/apply",
        permanent: true,
      },
      {
        source: "/help",
        destination: "/faq",
        permanent: true,
      },
      {
        source: "/help-centre",
        destination: "/faq",
        permanent: true,
      },
      {
        source: "/help-center",
        destination: "/faq",
        permanent: true,
      },
      {
        source: "/privacy",
        destination: "/privacy-policy",
        permanent: true,
      },
      {
        source: "/terms",
        destination: "/terms-of-service",
        permanent: true,
      },
      {
        source: "/tos",
        destination: "/terms-of-service",
        permanent: true,
      },
      {
        source: "/pricing",
        destination: "/blog/how-much-does-cleaning-cost-cape-town-2026",
        permanent: true,
      },
      {
        source: "/campaigns",
        destination: "/book",
        permanent: false,
      },
      {
        source: "/c/:slug",
        destination: "/campaigns/:slug",
        permanent: false,
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
    root: workspaceRoot,
  },
};

export default nextConfig;
