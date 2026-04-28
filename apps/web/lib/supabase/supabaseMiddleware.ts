import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth cookie and enforces cleaner-area session on navigations.
 * Requires browser auth via {@link getSupabaseBrowser} (`@supabase/ssr` cookie storage).
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, anon, {
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

  const pathname = request.nextUrl.pathname;
  const cleanerPublic = pathname.startsWith("/cleaner/login") || pathname.startsWith("/cleaner/apply");

  if (pathname.startsWith("/cleaner") && !cleanerPublic && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/cleaner/login";
    redirectUrl.searchParams.set("redirect", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
