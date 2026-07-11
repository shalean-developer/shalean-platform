import { ApiClientError, type ApiRequestOptions } from "@shalean/api-client";
import { getWebApiClient } from "@/lib/api/webApiClient";
import { getSupabaseAccessToken } from "@/lib/supabase/browser";

export async function getDashboardAccessToken(): Promise<string | null> {
  return getSupabaseAccessToken();
}

type DashboardFetchInit = RequestInit & { json?: unknown };

function resolveMethod(init: DashboardFetchInit): NonNullable<ApiRequestOptions["method"]> {
  const raw = (init.method ?? (init.json !== undefined || init.body != null ? "POST" : "GET")).toUpperCase();
  if (
    raw === "GET" ||
    raw === "POST" ||
    raw === "PUT" ||
    raw === "PATCH" ||
    raw === "DELETE" ||
    raw === "HEAD"
  ) {
    return raw;
  }
  return "GET";
}

/**
 * Authenticated JSON fetch for customer/dashboard surfaces.
 * Transport is `@shalean/api-client`; return shape and error strings match the pre-migration helper.
 */
export async function dashboardFetchJson<T>(
  path: string,
  init: DashboardFetchInit = {},
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  const token = await getDashboardAccessToken();
  if (!token) {
    return { ok: false, status: 401, error: "Not signed in." };
  }

  let res: Response;
  try {
    res = await getWebApiClient().request(path, {
      method: resolveMethod(init),
      headers: init.headers,
      json: init.json,
      body: init.json !== undefined ? undefined : init.body,
      signal: init.signal ?? undefined,
      timeoutMs: 0,
    });
  } catch (e) {
    // Preserve previous behaviour: native fetch network/abort errors propagate to callers.
    if (e instanceof ApiClientError && (e.code === "network" || e.code === "aborted") && e.cause != null) {
      throw e.cause;
    }
    throw e;
  }

  const j = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    return { ok: false, status: res.status, error: j.error ?? res.statusText };
  }
  return { ok: true, data: j as T };
}
