import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { sanitizeCleanerPostAuthRedirect } from "@/lib/cleaner/cleanerRedirect";

/**
 * Refreshes the Supabase auth cookie and enforces cleaner-area session on navigations.
 * Requires browser auth via {@link getSupabaseBrowser} (`@supabase/ssr` cookie storage).
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  const pathname = request.nextUrl.pathname;
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname === "/favicon.ico"
  ) {
    return supabaseResponse;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, anon, {
    auth: {
      /** Default 5s can time out under parallel navigations + refresh; align with browser client. */
      lockAcquireTimeout: process.env.NODE_ENV === "development" ? 60_000 : 15_000,
    },
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          if (options && typeof options === "object") {
            supabaseResponse.cookies.set(name, value, options as never);
          } else {
            supabaseResponse.cookies.set(name, value);
          }
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const cleanerPublic = pathname.startsWith("/cleaner/login") || pathname.startsWith("/cleaner/apply");

  if (pathname.startsWith("/cleaner") && !cleanerPublic && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/cleaner/login";
    const rawNext = `${pathname}${request.nextUrl.search}`;
    /** `URLSearchParams.set` percent-encodes the value when the URL is serialized (safe for query). */
    redirectUrl.searchParams.set("redirect", sanitizeCleanerPostAuthRedirect(rawNext));
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
