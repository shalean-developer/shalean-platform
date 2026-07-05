import "server-only";

/**
 * Low-level Zoho Books API client.
 *
 * Authentication: Server-based OAuth2 (offline access).
 * The initial refresh token is obtained once via the Zoho OAuth playground and stored in
 * ZOHO_REFRESH_TOKEN. This module auto-refreshes the short-lived access token (1h TTL) and
 * caches it in module scope so a single Node.js process never makes more than one token
 * refresh call per hour.
 *
 * Required env vars:
 *   ZOHO_CLIENT_ID         — OAuth app client ID
 *   ZOHO_CLIENT_SECRET     — OAuth app client secret
 *   ZOHO_REFRESH_TOKEN     — long-lived offline refresh token
 *   ZOHO_ORGANIZATION_ID   — Zoho Books organization ID (shown in Zoho Books → Settings → Organization Profile)
 *   ZOHO_ACCOUNTS_DOMAIN   — (optional) accounts domain, defaults to "accounts.zoho.com"
 *   ZOHO_API_DOMAIN        — (optional) API domain, defaults to "www.zohoapis.com"
 */

const ACCOUNTS_DOMAIN = process.env.ZOHO_ACCOUNTS_DOMAIN ?? "accounts.zoho.com";
const API_DOMAIN = process.env.ZOHO_API_DOMAIN ?? "www.zohoapis.com";
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID ?? "";

type TokenCache = { accessToken: string; expiresAt: number };
let _tokenCache: TokenCache | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (_tokenCache && _tokenCache.expiresAt > now + 60_000) {
    return _tokenCache.accessToken;
  }
  const clientId = process.env.ZOHO_CLIENT_ID ?? "";
  const clientSecret = process.env.ZOHO_CLIENT_SECRET ?? "";
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN ?? "";

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Zoho Books: ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, and ZOHO_REFRESH_TOKEN must be set");
  }

  const url = `https://${ACCOUNTS_DOMAIN}/oauth/v2/token`;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const res = await fetch(url, { method: "POST", body, cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Zoho token refresh failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (json.error) throw new Error(`Zoho token error: ${json.error}`);
  if (!json.access_token) throw new Error("Zoho token refresh: no access_token in response");

  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 3600;
  _tokenCache = { accessToken: json.access_token, expiresAt: now + expiresIn * 1000 };
  return json.access_token;
}

function booksUrl(path: string): string {
  if (!ORG_ID) throw new Error("Zoho Books: ZOHO_ORGANIZATION_ID must be set");
  const sep = path.includes("?") ? "&" : "?";
  return `https://${API_DOMAIN}/books/v3${path}${sep}organization_id=${ORG_ID}`;
}

async function request<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  attempt = 0,
): Promise<T> {
  const token = await getAccessToken();
  const url = booksUrl(path);

  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json;charset=UTF-8",
    },
    cache: "no-store",
  };

  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const res = await fetch(url, init);
  const json = (await res.json()) as { code?: number; message?: string } & T;

  const rateLimited =
    res.status === 429 || json.code === 45 || /rate limit/i.test(String(json.message ?? ""));

  if (rateLimited && attempt < 5) {
    const waitMs = Math.min(60_000, 5_000 * 2 ** attempt);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    return request<T>(method, path, body, attempt + 1);
  }

  if (!res.ok || (typeof json.code === "number" && json.code !== 0)) {
    throw new Error(
      `Zoho Books API error [${res.status}] ${path}: code=${json.code} ${json.message ?? ""}`,
    );
  }

  return json;
}

/**
 * Fetches a binary document (e.g. an invoice PDF via `?accept=pdf`).
 * Zoho returns the raw file bytes here rather than the usual JSON envelope.
 */
async function requestBinary(path: string): Promise<ArrayBuffer> {
  const token = await getAccessToken();
  const url = booksUrl(path);

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Zoho Books PDF error [${res.status}] ${path}: ${text}`);
  }

  return res.arrayBuffer();
}

export const zohoBooksClient = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
  getPdf: (path: string) => requestBinary(path),
};
