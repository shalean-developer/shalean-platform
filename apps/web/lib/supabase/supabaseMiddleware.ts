import { createServerClient } from "@supabase/ssr";
import { createClient, type User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { sanitizeCleanerPostAuthRedirect } from "@/lib/cleaner/cleanerRedirect";
import { isOfficePortalPath } from "@/lib/auth/officePortalPath";
import {
  OFFICE_VERIFICATION_COOKIE,
  officeSessionBinding,
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

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith("/_next") || pathname.startsWith("/static") || pathname === "/favicon.ico") {
    return supabaseResponse;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return supabaseResponse;

  let user: User | null = null;

  try {
    const supabase = createServerClient(url, anon, {
      auth: { lockAcquireTimeout: process.env.NODE_ENV === "development" ? 60_000 : 15_000 },
      cookieOptions: { path: "/", sameSite: "lax", secure: request.nextUrl.protocol === "https:" },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            if (options && typeof options === "object") supabaseResponse.cookies.set(name, value, options as never);
            else supabaseResponse.cookies.set(name, value);
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
        const publicClient = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
        const {
          data: { user: bearerUser },
          error: bearerError,
        } = await publicClient.auth.getUser(token);

        const bearerSessionBinding = officeSessionBinding(bearerUser?.last_sign_in_at);
        if (
          !bearerError &&
          bearerUser?.id &&
          !verifyOfficeVerificationToken(officeVerificationToken, bearerUser.id, bearerSessionBinding)
        ) {
          return officeVerificationRequiredResponse();
        }
      } catch (bearerCheckError) {
        console.error("[middleware] privileged Office verification check failed", bearerCheckError);
        return NextResponse.json({ error: "Authorization unavailable." }, { status: 503 });
      }
    } else if (
      user?.id &&
      !verifyOfficeVerificationToken(officeVerificationToken, user.id, officeSessionBinding(user.last_sign_in_at))
    ) {
      return officeVerificationRequiredResponse();
    }
  }

  const cleanerPublic = pathname.startsWith("/cleaner/login") || pathname.startsWith("/cleaner/apply");

  if (pathname.startsWith("/cleaner") && !cleanerPublic && !user) {
    const jobMagic = pathname.match(/^\/cleaner\/jobs\/([^/]+)$/);
    const magicT = request.nextUrl.searchParams.get("t");
    if (jobMagic?.[1] && magicT) {
      const bridge = request.nextUrl.clone();
      bridge.pathname = "/api/cleaner/magic-session";
      bridge.search = "";
      bridge.searchParams.set("b", jobMagic[1]);
      bridge.searchParams.set("t", magicT);
      return NextResponse.redirect(bridge);
    }

    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/cleaner/login";
    redirectUrl.searchParams.set("redirect", sanitizeCleanerPostAuthRedirect(`${pathname}${request.nextUrl.search}`));
    return NextResponse.redirect(redirectUrl);
  }

  if (pathname.startsWith("/account") && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirect", pathname + request.nextUrl.search);
    return NextResponse.redirect(redirectUrl);
  }

  if (pathname.startsWith("/jobs") && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirect", pathname + request.nextUrl.search);
    return NextResponse.redirect(redirectUrl);
  }

  if (isOfficePortalPath(pathname) && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirect", pathname + request.nextUrl.search);
    return NextResponse.redirect(redirectUrl);
  }

  if (
    isOfficePortalPath(pathname) &&
    user &&
    !verifyOfficeVerificationToken(
      officeVerificationToken,
      user.id,
      officeSessionBinding(user.last_sign_in_at),
    )
  ) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth/mfa";
    redirectUrl.search = "";
    redirectUrl.searchParams.set("redirect", pathname + request.nextUrl.search);
    return NextResponse.redirect(redirectUrl);
  }

  if (pathname.startsWith("/book/payment") && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirect", pathname + request.nextUrl.search);
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
