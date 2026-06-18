import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getLocation } from "@/lib/locations";
import { resolveLegacyGrowthLocal, resolveLegacySingularLocation } from "@/lib/seo/legacyPhase1EdgeRedirects";
import { locationHubPathFromAreaInput } from "@/lib/seo/capeTownLocations";
import { updateSession } from "@/lib/supabase/supabaseMiddleware";

/** Aligns HTML `meta name="robots"` on transactional pages; `noimageindex` avoids Google Images surfacing page assets. */
const X_ROBOTS_BLOCK = "noindex, nofollow, noimageindex";

function shouldNoIndexEntireDeployment(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const v = process.env.VERCEL_ENV;
  return v === "preview" || v === "development";
}

/**
 * Next.js 16+ request proxy (formerly `middleware.ts`): legacy SEO redirects + Supabase session refresh.
 * Legacy `/cleaning-services/*` is not listed in `next.config.ts` redirects (avoids double `-cleaning-services` suffix).
 */
export async function proxy(request: NextRequest) {
  try {
    return await runProxy(request);
  } catch (err) {
    console.error("[proxy] fatal — passthrough", err);
    return NextResponse.next();
  }
}

async function runProxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  /** Cron uses header auth only; skip Supabase session cloning work (and avoid any edge header quirks). */
  if (pathname.startsWith("/api/cron")) {
    return NextResponse.next();
  }

  /** `/location/{city}/{suburb}` (singular) — hub, JHB growth page, or 410 (never `/` or weak catalogue). */
  const legacySingularLocation = pathname.match(/^\/location\/([^/]+)\/([^/]+)\/?$/);
  if (legacySingularLocation) {
    const city = legacySingularLocation[1] ?? "";
    const suburb = legacySingularLocation[2] ?? "";
    const resolved = resolveLegacySingularLocation(city, suburb);
    if (resolved.type === "gone") {
      return new NextResponse(null, { status: 410 });
    }
    const url = request.nextUrl.clone();
    url.pathname = resolved.pathname;
    return NextResponse.redirect(url, 308);
  }

  /** `/growth/local/*` — Stage 19, else `/services/*-cape-town` by intent, else 410. */
  const growthLocal = resolveLegacyGrowthLocal(pathname);
  if (growthLocal !== null) {
    if (growthLocal.type === "gone") {
      return new NextResponse(null, { status: 410 });
    }
    const url = request.nextUrl.clone();
    url.pathname = growthLocal.pathname;
    return NextResponse.redirect(url, 308);
  }

  /** Thin “best cleaners in {area}” clones → canonical suburb hub (`/locations/{area}-cleaning-services`). */
  const bestCleaningBlog = pathname.match(/^\/blog\/best-cleaning-services-(.+)-cape-town\/?$/);
  if (bestCleaningBlog) {
    const area = bestCleaningBlog[1] ?? "";
    if (area) {
      const url = request.nextUrl.clone();
      url.pathname = `/locations/${area}-cleaning-services`;
      return NextResponse.redirect(url, 308);
    }
  }

  const legacy = pathname.match(/^\/cape-town\/cleaning-services\/([^/]+)\/?$/);
  if (legacy) {
    const segment = legacy[1] ?? "";
    const svc = getLocation(segment);
    if (svc?.citySlug === "cape-town" && segment === "cape-town") {
      const url = request.nextUrl.clone();
      url.pathname = "/services/standard-cleaning-cape-town";
      return NextResponse.redirect(url, 308);
    }
    const url = request.nextUrl.clone();
    url.pathname = locationHubPathFromAreaInput(segment);
    return NextResponse.redirect(url, 308);
  }

  const flatCleaning = pathname.match(/^\/cleaning-services\/([^/]+)\/?$/);
  if (flatCleaning) {
    const segment = flatCleaning[1] ?? "";
    const svc = getLocation(segment);
    if (svc?.citySlug === "cape-town" && segment === "cape-town") {
      const url = request.nextUrl.clone();
      url.pathname = "/services/standard-cleaning-cape-town";
      return NextResponse.redirect(url, 308);
    }
    const url = request.nextUrl.clone();
    url.pathname = locationHubPathFromAreaInput(segment);
    return NextResponse.redirect(url, 308);
  }

  const res = await updateSession(request);
  if (shouldNoIndexEntireDeployment()) {
    res.headers.set("X-Robots-Tag", X_ROBOTS_BLOCK);
  } else {
    const pathNorm = pathname.replace(/\/+$/, "") || "/";
    if (pathNorm === "/account/success" || pathNorm === "/booking/success" || pathNorm === "/payment/success") {
      res.headers.set("X-Robots-Tag", X_ROBOTS_BLOCK);
    }
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
