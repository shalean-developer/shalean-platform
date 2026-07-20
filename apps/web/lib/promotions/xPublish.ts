/**
 * MKT-001I — X (Twitter) Connected Accounts + text-only publishing.
 *
 * DB provider column uses legacy name `twitter` (CHECK constraint).
 * Adapter / ledger / registry key is `x`.
 */

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { encryptSecret, decryptSecret } from "@/lib/security/tokenEncryption";
import {
  X_TWEETS_URL,
  fetchXAuthenticatedUser,
  getXOAuthConfig,
  logXOAuthEvent,
  maskXUserId,
  refreshXAccessToken,
  revokeXToken,
} from "@/lib/oauth/xOAuth";

/** social_accounts.provider CHECK value */
export const X_DB_PROVIDER = "twitter" as const;

export const X_TWEET_CHAR_LIMIT = 280;

export type XPublishConfig = {
  userId: string;
  username: string | null;
  accessToken: string;
};

export type XConnectionPublic = {
  connected: boolean;
  status: string;
  health: string;
  accountName: string | null;
  userIdMasked: string | null;
  username: string | null;
  lastSync: string | null;
  lastPublishAt: string | null;
  lastError: string | null;
  expiresAt: string | null;
  oauthConfigured: boolean;
};

export async function getXConnectionPublic(): Promise<XConnectionPublic> {
  const oauthConfigured = Boolean(getXOAuthConfig());
  const admin = getSupabaseAdmin();
  if (!admin) {
    return {
      connected: false,
      status: "disconnected",
      health: "unknown",
      accountName: null,
      userIdMasked: null,
      username: null,
      lastSync: null,
      lastPublishAt: null,
      lastError: null,
      expiresAt: null,
      oauthConfigured,
    };
  }

  const { data } = await admin
    .from("social_accounts")
    .select(
      "account_id, account_name, status, health, last_sync, last_publish_at, expires_at, access_token, metadata",
    )
    .eq("provider", X_DB_PROVIDER)
    .maybeSingle();

  if (!data) {
    return {
      connected: false,
      status: "disconnected",
      health: "disconnected",
      accountName: null,
      userIdMasked: null,
      username: null,
      lastSync: null,
      lastPublishAt: null,
      lastError: null,
      expiresAt: null,
      oauthConfigured,
    };
  }

  const meta = (data.metadata ?? {}) as Record<string, unknown>;
  const hasToken = Boolean(data.access_token && String(data.access_token).startsWith("v"));
  const status = String(data.status ?? "disconnected");
  const connected = status === "connected" && hasToken && Boolean(data.account_id);

  return {
    connected,
    status: connected ? "connected" : status,
    health: connected ? String(data.health ?? "healthy") : "disconnected",
    accountName: data.account_name ?? null,
    userIdMasked: maskXUserId(data.account_id),
    username: typeof meta.username === "string" ? meta.username : null,
    lastSync: (data.last_sync as string) ?? null,
    lastPublishAt: (data.last_publish_at as string) ?? null,
    lastError: typeof meta.lastError === "string" ? meta.lastError : null,
    expiresAt: (data.expires_at as string) ?? null,
    oauthConfigured,
  };
}

export async function saveXOAuthConnection(args: {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  connectedBy: string;
  existingRefreshToken?: string | null;
  correlationId?: string;
}): Promise<
  | { ok: true; userId: string; username: string | null }
  | { ok: false; error: string; code?: "identity" | "encrypt" | "persist" }
> {
  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, error: "Server configuration error.", code: "persist" };

  let identity;
  try {
    identity = await fetchXAuthenticatedUser(args.accessToken);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to fetch X user identity.",
      code: "identity",
    };
  }

  const refresh = args.refreshToken ?? args.existingRefreshToken ?? null;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + Math.max(60, args.expiresIn) * 1000).toISOString();

  let encryptedAccess: string;
  let encryptedRefresh: string | null = null;
  try {
    encryptedAccess = encryptSecret(args.accessToken);
    if (refresh) encryptedRefresh = encryptSecret(refresh);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Token encryption failed.",
      code: "encrypt",
    };
  }

  const row = {
    provider: X_DB_PROVIDER,
    account_name: identity.username ? `@${identity.username}` : identity.name ?? "X",
    account_id: identity.id,
    location_name: null,
    location_id: null,
    access_token: encryptedAccess,
    refresh_token: encryptedRefresh,
    expires_at: expiresAt,
    connected_by: args.connectedBy,
    connected_at: now.toISOString(),
    last_sync: now.toISOString(),
    status: "connected",
    health: "healthy",
    metadata: {
      authModel: "oauth2_pkce",
      username: identity.username,
      name: identity.name,
      correlationId: args.correlationId ?? null,
      lastError: null,
      lastVerifiedAt: now.toISOString(),
    },
    updated_at: now.toISOString(),
  };

  const { error } = await admin.from("social_accounts").upsert(row, { onConflict: "provider" });
  if (error) {
    return { ok: false, error: error.message, code: "persist" };
  }

  logXOAuthEvent("connection_persisted", {
    correlationId: args.correlationId ?? null,
    userIdMasked: maskXUserId(identity.id),
    usernamePresent: Boolean(identity.username),
    hasRefresh: Boolean(refresh),
  });

  return { ok: true, userId: identity.id, username: identity.username };
}

export async function disconnectXConnection(args?: {
  actor?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const { data } = await admin
    .from("social_accounts")
    .select("access_token, refresh_token")
    .eq("provider", X_DB_PROVIDER)
    .maybeSingle();

  const cfg = getXOAuthConfig();
  if (cfg && data?.access_token) {
    try {
      const token = decryptSecret(data.access_token as string);
      await revokeXToken(cfg, token);
    } catch {
      // Best-effort revoke; still delete local row.
    }
  }

  const { error } = await admin.from("social_accounts").delete().eq("provider", X_DB_PROVIDER);
  if (error) return { ok: false, error: error.message };

  logXOAuthEvent("connection_disconnected", { actor: args?.actor ?? null });
  return { ok: true };
}

/**
 * Resolve a valid access token, refreshing when near expiry.
 */
export async function resolveXPublishConfig(): Promise<
  | { ok: true; config: XPublishConfig }
  | { ok: false; error: string; status?: number; code?: "missing" | "expired" | "refresh_failed" }
> {
  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, error: "Server configuration error.", code: "missing" };

  const { data } = await admin
    .from("social_accounts")
    .select("account_id, account_name, access_token, refresh_token, expires_at, status, metadata")
    .eq("provider", X_DB_PROVIDER)
    .maybeSingle();

  if (!data?.account_id || !data.access_token || data.status !== "connected") {
    return {
      ok: false,
      error: "X is not connected. Connect from Connected Accounts.",
      code: "missing",
      status: 401,
    };
  }

  const meta = (data.metadata ?? {}) as Record<string, unknown>;
  let accessToken: string;
  try {
    accessToken = decryptSecret(data.access_token as string);
  } catch {
    return {
      ok: false,
      error: "Stored X token could not be decrypted. Reconnect X.",
      code: "expired",
      status: 401,
    };
  }

  const expiresAtMs = data.expires_at ? Date.parse(String(data.expires_at)) : NaN;
  const needsRefresh =
    !Number.isNaN(expiresAtMs) && expiresAtMs - Date.now() < 5 * 60 * 1000;

  if (needsRefresh) {
    const cfg = getXOAuthConfig();
    const refreshEnc = data.refresh_token as string | null;
    if (!cfg || !refreshEnc) {
      return {
        ok: false,
        error: "X access token expired. Reconnect X from Connected Accounts.",
        code: "expired",
        status: 401,
      };
    }
    try {
      const refreshToken = decryptSecret(refreshEnc);
      const tokens = await refreshXAccessToken(cfg, refreshToken);
      accessToken = tokens.access_token;
      const now = new Date();
      const nextExpiry = new Date(
        now.getTime() + Math.max(60, tokens.expires_in) * 1000,
      ).toISOString();
      await admin
        .from("social_accounts")
        .update({
          access_token: encryptSecret(tokens.access_token),
          refresh_token: tokens.refresh_token
            ? encryptSecret(tokens.refresh_token)
            : refreshEnc,
          expires_at: nextExpiry,
          last_sync: now.toISOString(),
          updated_at: now.toISOString(),
          health: "healthy",
          metadata: {
            ...meta,
            lastError: null,
            lastVerifiedAt: now.toISOString(),
          },
        })
        .eq("provider", X_DB_PROVIDER);
      logXOAuthEvent("token_refreshed", { userIdMasked: maskXUserId(String(data.account_id)) });
    } catch (e) {
      logXOAuthEvent("token_refresh_failed", {
        userIdMasked: maskXUserId(String(data.account_id)),
        error: e instanceof Error ? e.message.slice(0, 120) : "refresh_failed",
      });
      return {
        ok: false,
        error: "X token refresh failed. Reconnect X from Connected Accounts.",
        code: "refresh_failed",
        status: 401,
      };
    }
  }

  return {
    ok: true,
    config: {
      userId: String(data.account_id),
      username:
        typeof meta.username === "string"
          ? meta.username
          : data.account_name?.replace(/^@/, "") ?? null,
      accessToken,
    },
  };
}

export function formatXPublishError(
  body: { title?: string; detail?: string; type?: string; status?: number } | undefined,
  httpStatus: number,
): { error: string; retryable: boolean } {
  const detail = (body?.detail || body?.title || "").trim();
  const lower = detail.toLowerCase();

  if (httpStatus === 401 || lower.includes("unauthorized") || lower.includes("invalid")) {
    return {
      error: (detail || "X access token is invalid or expired.") + " Reconnect X from Connected Accounts.",
      retryable: false,
    };
  }
  if (
    httpStatus === 403 ||
    lower.includes("forbidden") ||
    lower.includes("not permitted") ||
    lower.includes("suspended") ||
    lower.includes("access level")
  ) {
    return {
      error:
        detail ||
        "X rejected the post (missing write permission, insufficient API product access, or account restriction).",
      retryable: false,
    };
  }
  if (httpStatus === 429 || lower.includes("rate limit")) {
    return {
      error: detail || "X rate limit exceeded. Wait and retry.",
      retryable: true,
    };
  }
  if (httpStatus === 409 || lower.includes("duplicate")) {
    return {
      error: detail || "Duplicate X post rejected.",
      retryable: false,
    };
  }
  if (httpStatus >= 500) {
    return {
      error: detail || "X API unavailable. Retry later.",
      retryable: true,
    };
  }
  return {
    error: detail || `X publish failed (${httpStatus}).`,
    retryable: false,
  };
}

export type XPublishResult =
  | { ok: true; tweetId: string }
  | { ok: false; error: string; status?: number; retryable?: boolean };

/** Text-only tweet creation. */
export async function publishXTextTweet(args: {
  text: string;
  accessToken?: string;
}): Promise<XPublishResult> {
  const text = args.text.trim();
  if (!text) return { ok: false, error: "Tweet text is required.", status: 400 };
  if (text.length > X_TWEET_CHAR_LIMIT) {
    return {
      ok: false,
      error: `Tweet exceeds ${X_TWEET_CHAR_LIMIT} characters.`,
      status: 400,
    };
  }

  let accessToken = args.accessToken?.trim() || "";
  if (!accessToken) {
    const resolved = await resolveXPublishConfig();
    if (!resolved.ok) {
      return { ok: false, error: resolved.error, status: resolved.status ?? 401 };
    }
    accessToken = resolved.config.accessToken;
  }

  const res = await fetch(X_TWEETS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  const json = (await res.json().catch(() => ({}))) as {
    data?: { id?: string; text?: string };
    title?: string;
    detail?: string;
    type?: string;
    status?: number;
    errors?: Array<{ message?: string }>;
  };

  if (!res.ok || !json.data?.id) {
    const formatted = formatXPublishError(
      {
        title: json.title || json.errors?.[0]?.message,
        detail: json.detail || json.errors?.[0]?.message,
        type: json.type,
        status: json.status,
      },
      res.status,
    );
    logXOAuthEvent("publish_failed", {
      httpStatus: res.status,
      retryable: formatted.retryable,
    });
    return {
      ok: false,
      error: formatted.error,
      status: res.status,
      retryable: formatted.retryable,
    };
  }

  const admin = getSupabaseAdmin();
  if (admin) {
    const now = new Date().toISOString();
    await admin
      .from("social_accounts")
      .update({ last_publish_at: now, last_sync: now, updated_at: now })
      .eq("provider", X_DB_PROVIDER);
  }

  logXOAuthEvent("publish_ok", { tweetIdPresent: true });
  return { ok: true, tweetId: String(json.data.id) };
}
