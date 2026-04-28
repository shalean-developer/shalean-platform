"use client";

import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { sanitizeCleanerPostAuthRedirect } from "@/lib/cleaner/cleanerRedirect";
import { metrics } from "@/lib/metrics/counters";

type SupabaseBrowser = NonNullable<ReturnType<typeof getSupabaseBrowser>>;

/** Coalesce concurrent 401s into one `refreshSession()` (thundering herd). */
let singleFlightRefresh: ReturnType<SupabaseBrowser["auth"]["refreshSession"]> | null = null;

function mergeBearerInit(init: RequestInit | undefined, accessToken: string): RequestInit {
  const headers = new Headers(init?.headers ?? undefined);
  headers.set("Authorization", `Bearer ${accessToken}`);
  return { ...init, headers };
}

function redirectCleanerLogin(): void {
  if (typeof window === "undefined") return;
  const path = `${window.location.pathname}${window.location.search}`;
  const next = sanitizeCleanerPostAuthRedirect(path.startsWith("/cleaner") ? path : "/cleaner");
  window.location.assign(`/cleaner/login?redirect=${encodeURIComponent(next)}`);
}

function refreshSessionOnce(supabase: SupabaseBrowser): ReturnType<SupabaseBrowser["auth"]["refreshSession"]> {
  if (!singleFlightRefresh) {
    metrics.increment("cleaner_auth_refresh_attempt");
    singleFlightRefresh = supabase.auth
      .refreshSession()
      .then((r) => {
        if (r.error || !r.data.session?.access_token) {
          metrics.increment("cleaner_auth_refresh_failure");
        } else {
          metrics.increment("cleaner_auth_refresh_success");
        }
        return r;
      })
      .finally(() => {
        singleFlightRefresh = null;
      });
  }
  return singleFlightRefresh;
}

function networkErrorResponse(): Response {
  return new Response(
    JSON.stringify({
      error: "Could not reach the server. Check your connection, then refresh the page.",
    }),
    { status: 503, statusText: "Network Error", headers: { "Content-Type": "application/json" } },
  );
}

/** Same-origin fetch that turns thrown network errors into a 503 JSON body (so callers don’t crash). */
async function fetchOrNetworkResponse(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    return networkErrorResponse();
  }
}

/**
 * Fetch for `/api/cleaner/*` — on 401 attempts one `refreshSession` + retry (SSR cookie refresh),
 * then redirects to login if still unauthorized.
 */
export async function cleanerAuthenticatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetchOrNetworkResponse(input, init);
  if (res.status !== 401 || typeof window === "undefined") {
    return res;
  }

  const supabase = getSupabaseBrowser();
  if (!supabase) {
    redirectCleanerLogin();
    return res;
  }

  const { data, error } = await refreshSessionOnce(supabase);
  if (error || !data.session?.access_token) {
    redirectCleanerLogin();
    return res;
  }

  const retry = await fetchOrNetworkResponse(input, mergeBearerInit(init, data.session.access_token));
  if (retry.status !== 401) {
    return retry;
  }

  redirectCleanerLogin();
  return retry;
}
