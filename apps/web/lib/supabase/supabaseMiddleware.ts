import { createServerClient } from "@supabase/ssr";
import { createClient, type User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { sanitizeCleanerPostAuthRedirect } from "@/lib/cleaner/cleanerRedirect";
import { isOfficePortalPath } from "@/lib/auth/officePortalPath";
import {
  OFFICE_VERIFICATION_COOKIE,
  verifyOfficeVerificationToken,
} from "@/lib/auth/officeEmailVerification";

function privilegedOfficeApiPath(pathname: string): boolean {
  return (
    pathname.startsWith("/api/admin/") ||
    pathname === "/api/admin" ||
    pathname.startsWith("/api/dispatch/") ||
    pathname === "/api/dispatch" ||
    pathname.startsWith("/api/oauth/google") ||
    pathname.startsWith("/api/oauth/x")
  );
}

function officeVerificationRequiredResponse(): NextResponse {
  return NextResponse.json(
    {
      error: "Office email verification is required for privileged access.",
      code: "office_email_verification_required",
    },
    { status: 403 },
  );
}

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

  let user: User | null = null;

  try {
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

    try {
      const { data } = await supabase.auth.getUser();
      user = data.user ?? null;
    } catch (authErr) {
      console.error("[middleware] supabase.auth.getUser failed — continuing without session", authErr);
    }
  } catch (clientErr) {
    console.error("[middleware] Supabase client/session refresh failed — passthrough", clientErr);
    return supabaseResponse;
  }

  const officeVerificationToken = request.cookies.get(OFFICE_VERIFICATION_COOKIE)?.value ?? null;

  if (privilegedOfficeApiPath(pathname)) {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";

    if (token) {
      try {
        const publicClient = createClient(url, anon, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const {
          data: { user: bearerUser },
          error: bearerError,
        } = await publicClient.auth.getUser(token);

        // Only verified Supabase user sessions are Office-verification gated here.
        // Invalid/custom bearer values are intentionally left to the route's
        // existing machine/cron authorization so automation credentials keep working.
        if (
          !bearerError &&
          bearerUser?.id &&
          !verifyOfficeVerificationToken(officeVerificationToken, bearerUser.id)
        ) {
          return officeVerificationRequiredResponse();
        }
      } catch (bearerCheckError) {
        console.error("[middleware] privileged Office verification check failed", bearerCheckError);
        return NextResponse.json({ error: "Authorization unavailable." }, { status: 503 });
      }
    } else if (user?.id && !verifyOfficeVerificationToken(officeVerificationToken, user.id)) {
      return officeVerificationRequiredResponse();
    }
  }

  const cleanerPublic = pathname.startsWith("/cleaner/login") || pathname.startsWith("/cleaner/apply");

  if (pathname.startsWith("/cleaner") && !cleanerPublic && !user) {
    const jobMagic = pathname.match(/^\/cleaner\/jobs\/([^/]+)$/);
    const magicT = request.nextUrl.searchParams.get("t");
    if (jobMagic?.[1] && magicT) {
      const bid = jobMagic[1];
      const bridge = request.nextUrl.clone();
      bridge.pathname = "/api/cleaner/magic-session";
      bridge.search = "";
      bridge.searchParams.set("b", bid);
      bridge.searchParams.set("t", magicT);
      return NextResponse.redirect(bridge);
    }

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/cleaner/login";
    const rawNext = `${pathname}${request.nextUrl.search}`;
    /** `URLSearchParams.set` percent-encodes the value when the URL is serialized (safe for query). */
    redirectUrl.searchParams.set("redirect", sanitizeCleanerPostAuthRedirect(rawNext));
    return NextResponse.redirect(redirectUrl);
  }

  // Protect customer dashboard — redirect unauthenticated users to login
  if (pathname.startsWith("/account") && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirect", pathname + request.nextUrl.search);
    return NextResponse.redirect(redirectUrl);
  }

  // Protect cleaner jobs dashboard
  if (pathname.startsWith("/jobs") && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirect", pathname + request.nextUrl.search);
    return NextResponse.redirect(redirectUrl);
  }

  // Protect admin office dashboard (not public `/office-cleaning/*` SEO landings)
  if (isOfficePortalPath(pathname) && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirect", pathname + request.nextUrl.search);
    return NextResponse.redirect(redirectUrl);
  }

  // Require the Shalean-managed email verification session for authenticated Office users.
  if (
    isOfficePortalPath(pathname) &&
    user &&
    !verifyOfficeVerificationToken(officeVerificationToken, user.id)
  ) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth/mfa";
    redirectUrl.search = "";
    redirectUrl.searchParams.set("redirect", pathname + request.nextUrl.search);
    return NextResponse.redirect(redirectUrl);
  }

  // Payment step requires any signed-in user
  if (pathname.startsWith("/book/payment") && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirect", pathname + request.nextUrl.search);
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
