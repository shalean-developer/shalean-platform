import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { locationSeoPathFromLegacyAreaSlug } from "@/lib/seo/capeTownSeoPages";
import { updateSession } from "@/lib/supabase/supabaseMiddleware";

export async function middleware(request: NextRequest) {
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

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
