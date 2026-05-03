import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getLocation } from "@/lib/locations";
import { locationSeoPathFromLegacyAreaSlug } from "@/lib/seo/capeTownSeoPages";
import { updateSession } from "@/lib/supabase/supabaseMiddleware";

/** Aligns HTML `meta name="robots"` on transactional pages; `noimageindex` avoids Google Images surfacing page assets. */
const X_ROBOTS_BLOCK = "noindex, nofollow, noimageindex";

/** Non-prod and Vercel Preview/Development: block indexing for the whole deployment. */
function shouldNoIndexEntireDeployment(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const v = process.env.VERCEL_ENV;
  return v === "preview" || v === "development";
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const legacy = pathname.match(/^\/cape-town\/cleaning-services\/([^/]+)\/?$/);
  if (legacy) {
    const destPath = locationSeoPathFromLegacyAreaSlug(legacy[1] ?? "");
    if (destPath) {
      const url = request.nextUrl.clone();
      url.pathname = destPath;
      url.search = "";
      return NextResponse.redirect(url, 308);
    }
  }

  /** Legacy flat URLs `/cleaning-services/{area}` → canonical `/locations/{area}-cleaning-services`. */
  const flatCleaning = pathname.match(/^\/cleaning-services\/([^/]+)\/?$/);
  if (flatCleaning) {
    const segment = flatCleaning[1] ?? "";
    const destPath = locationSeoPathFromLegacyAreaSlug(segment);
    if (destPath) {
      const url = request.nextUrl.clone();
      url.pathname = destPath;
      url.search = "";
      return NextResponse.redirect(url, 308);
    }
    const svc = getLocation(segment);
    if (svc?.citySlug === "cape-town" && segment === "cape-town") {
      const url = request.nextUrl.clone();
      url.pathname = "/services/standard-cleaning-cape-town";
      url.search = "";
      return NextResponse.redirect(url, 308);
    }
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
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
