import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getLocation } from "@/lib/locations";
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
 * Legacy SEO URLs → canonical `/locations/*` hubs via `locationHubPathFromAreaInput` (308).
 * `/cleaning-services/*` is not redirected in `next.config.ts` (avoids double `-cleaning-services` suffix).
 *
 * Kept as `middleware.ts` (not `proxy.ts`) because **`next build --webpack` in Next.js 16.2 still opens this path**
 * and fails with ENOENT if only `proxy.ts` exists (upstream webpack integration gap).
 */
export async function middleware(request: NextRequest) {
  try {
    return await runMiddleware(request);
  } catch (err) {
    console.error("[middleware] fatal — passthrough", err);
    return NextResponse.next();
  }
}

async function runMiddleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const legacy = pathname.match(/^\/cape-town\/cleaning-services\/([^/]+)\/?$/);
  if (legacy) {
    const segment = legacy[1] ?? "";
    const svc = getLocation(segment);
    if (svc?.citySlug === "cape-town" && segment === "cape-town") {
      const url = request.nextUrl.clone();
      url.pathname = "/services/standard-cleaning-cape-town";
      url.search = "";
      return NextResponse.redirect(url, 308);
    }
    const url = request.nextUrl.clone();
    url.pathname = locationHubPathFromAreaInput(segment);
    url.search = "";
    return NextResponse.redirect(url, 308);
  }

  const flatCleaning = pathname.match(/^\/cleaning-services\/([^/]+)\/?$/);
  if (flatCleaning) {
    const segment = flatCleaning[1] ?? "";
    const svc = getLocation(segment);
    if (svc?.citySlug === "cape-town" && segment === "cape-town") {
      const url = request.nextUrl.clone();
      url.pathname = "/services/standard-cleaning-cape-town";
      url.search = "";
      return NextResponse.redirect(url, 308);
    }
    const url = request.nextUrl.clone();
    url.pathname = locationHubPathFromAreaInput(segment);
    url.search = "";
    return NextResponse.redirect(url, 308);
  }

  const res = await updateSession(request);
  if (shouldNoIndexEntireDeployment()) {
    res.headers.set("X-Robots-Tag", X_ROBOTS_BLOCK);
  } else {
    const pathNorm = pathname.replace(/\/+$/, "") || "/";
    if (pathNorm === "/booking/success" || pathNorm === "/payment/success") {
      res.headers.set("X-Robots-Tag", X_ROBOTS_BLOCK);
    }
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
