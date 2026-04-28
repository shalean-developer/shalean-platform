"use client";

/**
 * Fetch for `/api/cleaner/*` — redirects to login on 401 so expired tokens recover with UX.
 */
export async function cleanerAuthenticatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401 && typeof window !== "undefined") {
    const path = `${window.location.pathname}${window.location.search}`;
    const next = path.startsWith("/cleaner") ? path : "/cleaner/dashboard";
    window.location.assign(`/cleaner/login?redirect=${encodeURIComponent(next)}`);
  }
  return res;
}
