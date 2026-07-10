import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { remapAdminPathToOffice } from "@/lib/admin/remapAdminPathToOffice";
import { getLocation } from "@/lib/locations";
import { resolveLegacyGrowthLocal, resolveLegacySingularLocation } from "@/lib/seo/legacyPhase1EdgeRedirects";
import { isSeoRebuildGonePath } from "@/lib/seo/seoRebuildPhase1";
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
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase() ?? "";

  /** Apex .com / www currently 404 outside this app — force canonical .co.za for shared campaign links. */
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

  /** Phase-1 SEO rebuild — retired programmatic URLs (not blanket homepage redirects). */
  /** User-facing commercial hubs: redirect to live replacements instead of bare 410. */
  const commercialHubRedirects: Record<string, string> = {
    "/cleaning-prices-cape-town": "/blog/how-much-does-cleaning-cost-cape-town-2026",
    "/cleaning-services-cape-town": "/services",
    "/maid-services-cape-town": "/services",
    "/cleaning-services": "/services",
  };
  const hubDest = commercialHubRedirects[pathname.replace(/\/$/, "") || "/"];
  if (hubDest) {
    const url = request.nextUrl.clone();
    url.pathname = hubDest;
    return NextResponse.redirect(url, 308);
  }

  if (isSeoRebuildGonePath(pathname)) {
    return new NextResponse(null, { status: 410 });
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

  /** Thin “best cleaners in {area}” clones — permanently removed (410). */
  const bestCleaningBlog = pathname.match(/^\/blog\/best-cleaning-services-(.+)-cape-town\/?$/);
  if (bestCleaningBlog?.[1]) {
    return new NextResponse(null, { status: 410 });
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
