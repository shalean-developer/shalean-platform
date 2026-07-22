import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { remapAdminPathToOffice } from "@/lib/admin/remapAdminPathToOffice";
import { getLocation } from "@/lib/locations";
import {
  resolveLegacyGrowthLocal,
  resolveLegacySingularLocation,
  resolveLegacyStage19IntentPath,
} from "@/lib/seo/legacyPhase1EdgeRedirects";
import { resolveLegacyMarketingExactRedirect } from "@/lib/seo/legacyMarketingRedirectMatrix";
import { isSeoRebuildGonePath } from "@/lib/seo/seoRebuildPhase1";
import { CAPE_TOWN_LOCATIONS, locationHubPathFromAreaInput } from "@/lib/seo/capeTownLocations";
import { updateSession } from "@/lib/supabase/supabaseMiddleware";

/** Aligns HTML `meta name="robots"` on transactional pages; `noimageindex` avoids Google Images surfacing page assets. */
const X_ROBOTS_BLOCK = "noindex, nofollow, noimageindex";

function shouldNoIndexEntireDeployment(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const v = process.env.VERCEL_ENV;
  return v === "preview" || v === "development";
}

function redirectPreservingSearch(request: NextRequest, destinationPath: string, status: 301 | 308) {
  const url = request.nextUrl.clone();
  if (destinationPath.startsWith("/#")) {
    url.pathname = "/";
    url.hash = destinationPath.slice(2);
  } else {
    const hashIdx = destinationPath.indexOf("#");
    if (hashIdx >= 0) {
      url.pathname = destinationPath.slice(0, hashIdx) || "/";
      url.hash = destinationPath.slice(hashIdx + 1);
    } else {
      url.pathname = destinationPath;
      url.hash = "";
    }
  }
  return NextResponse.redirect(url, status);
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
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase() ?? "";

  /** Apex .com / www — force canonical .co.za when this app receives the request. */
  if (host === "shalean.com" || host === "www.shalean.com") {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    url.host = "shalean.co.za";
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  /** Short campaign links used in ads / captions. */
  const shortCampaign = pathname.match(/^\/c\/([^/]+)\/?$/);
  if (shortCampaign?.[1]) {
    const url = request.nextUrl.clone();
    url.pathname = `/campaigns/${shortCampaign[1]}`;
    return NextResponse.redirect(url, 308);
  }

  /** Cron uses header auth only; skip Supabase session cloning work (and avoid any edge header quirks). */
  if (pathname.startsWith("/api/cron")) {
    return NextResponse.next();
  }

  /** Exact-path legacy marketing migrations (one hop, permanent). */
  const marketing = resolveLegacyMarketingExactRedirect(pathname);
  if (marketing) {
    return redirectPreservingSearch(request, marketing.destination, marketing.status);
  }

  /** `/location/{city}/{suburb}` (singular) — hub or 410. */
  const legacySingularLocation = pathname.match(/^\/location\/([^/]+)\/([^/]+)\/?$/);
  if (legacySingularLocation) {
    const city = legacySingularLocation[1] ?? "";
    const suburb = legacySingularLocation[2] ?? "";
    const resolved = resolveLegacySingularLocation(city, suburb);
    if (resolved.type === "gone") {
      return new NextResponse(null, { status: 410 });
    }
    return redirectPreservingSearch(request, resolved.pathname, 308);
  }

  /** `/growth/local/*` — hub/service or 410. */
  const growthLocal = resolveLegacyGrowthLocal(pathname);
  if (growthLocal !== null) {
    if (growthLocal.type === "gone") {
      return new NextResponse(null, { status: 410 });
    }
    return redirectPreservingSearch(request, growthLocal.pathname, 308);
  }

  /** Stage-19 `/{intent}/{suburb}` — hub/service (never leave as competing landings). */
  const stage19 = resolveLegacyStage19IntentPath(pathname);
  if (stage19 !== null) {
    if (stage19.type === "gone") {
      return new NextResponse(null, { status: 410 });
    }
    return redirectPreservingSearch(request, stage19.pathname, 308);
  }

  const legacy = pathname.match(/^\/cape-town\/cleaning-services\/([^/]+)\/?$/);
  if (legacy) {
    const segment = legacy[1] ?? "";
    const svc = getLocation(segment);
    if (svc?.citySlug === "cape-town" && segment === "cape-town") {
      return redirectPreservingSearch(request, "/services/standard-cleaning-cape-town", 308);
    }
    return redirectPreservingSearch(request, locationHubPathFromAreaInput(segment), 308);
  }

  const flatCleaning = pathname.match(/^\/cleaning-services\/([^/]+)\/?$/);
  if (flatCleaning) {
    const segment = flatCleaning[1] ?? "";
    const svc = getLocation(segment);
    if (svc?.citySlug === "cape-town" && segment === "cape-town") {
      return redirectPreservingSearch(request, "/services/standard-cleaning-cape-town", 308);
    }
    return redirectPreservingSearch(request, locationHubPathFromAreaInput(segment), 308);
  }

  /**
   * Short `/locations/{slug}` that is not an exact catalogue hub slug (e.g. DB suburb
   * `beacon-hill`) — permanently redirect to the hub path or `/locations` overview.
   */
  const locationsSegment = pathname.match(/^\/locations\/([^/]+)\/?$/);
  if (locationsSegment?.[1]) {
    const segment = decodeURIComponent(locationsSegment[1]).trim().toLowerCase();
    const isExactHub = CAPE_TOWN_LOCATIONS.some((l) => l.slug === segment);
    if (!isExactHub) {
      const dest = locationHubPathFromAreaInput(segment);
      if (dest !== pathname.replace(/\/+$/, "") && dest !== `/locations/${segment}`) {
        return redirectPreservingSearch(request, dest, 308);
      }
    }
  }

  /** Thin “best cleaners in {area}” clones — permanently removed (410). */
  const bestCleaningBlog = pathname.match(/^\/blog\/best-cleaning-services-(.+)-cape-town\/?$/);
  if (bestCleaningBlog?.[1]) {
    return new NextResponse(null, { status: 410 });
  }

  if (isSeoRebuildGonePath(pathname)) {
    return new NextResponse(null, { status: 410 });
  }

  /** Admin console cutover — all `/admin/*` pages live under `/office/*`. */
  if (pathname === "/admin" || pathname === "/admin/" || pathname.startsWith("/admin/")) {
    if (pathname === "/admin/login" || pathname.startsWith("/admin/login/")) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("role", "admin");
      const redirectTo = url.searchParams.get("redirect");
      if (!redirectTo || !redirectTo.startsWith("/") || redirectTo.startsWith("//")) {
        url.searchParams.set("redirect", "/office");
      } else {
        const [pathPart, ...queryParts] = redirectTo.split("?");
        const remappedPath = remapAdminPathToOffice(pathPart ?? redirectTo);
        const query = queryParts.length > 0 ? `?${queryParts.join("?")}` : "";
        url.searchParams.set("redirect", `${remappedPath}${query}`);
      }
      return NextResponse.redirect(url, 308);
    }

    const url = request.nextUrl.clone();
    url.pathname = remapAdminPathToOffice(pathname);
    if (pathname === "/admin/payout-runs" || pathname.startsWith("/admin/payout-runs/")) {
      url.searchParams.set("tab", "disbursements");
    }
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
