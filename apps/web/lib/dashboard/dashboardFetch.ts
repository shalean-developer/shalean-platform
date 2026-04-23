import { getSupabaseClient } from "@/lib/supabaseClient";

export async function getDashboardAccessToken(): Promise<string | null> {
  const sb = getSupabaseClient();
  if (!sb) return null;
  const { data, error } = await sb.auth.getSession();
  if (error || !data.session?.access_token) return null;
  return data.session.access_token;
}

export async function dashboardFetchJson<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string }> {
  const token = await getDashboardAccessToken();
  if (!token) {
    return { ok: false, status: 401, error: "Not signed in." };
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(path, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
  const j = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    return { ok: false, status: res.status, error: j.error ?? res.statusText };
  }
  return { ok: true, data: j as T };
}
