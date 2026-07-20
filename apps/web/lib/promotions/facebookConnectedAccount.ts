import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  TokenEncryptionConfigError,
  decryptSecret,
  encryptSecret,
} from "@/lib/security/tokenEncryption";
import {
  FACEBOOK_OAUTH_SCOPES,
  discoverFacebookPages,
  getFacebookGraphApiVersion,
  getFacebookOAuthConfig,
  isFacebookEnvTokenFallbackAllowed,
  logFacebookOAuthEvent,
  maskFacebookPageId,
  type FacebookDiscoveredPage,
} from "@/lib/oauth/metaFacebookOAuth";
import type { FacebookCallbackFailureStage } from "@/lib/oauth/metaFacebookSaveError";
import type { FacebookPublishConfig } from "@/lib/promotions/facebookPublish";

export const FACEBOOK_AUTH_MODEL = "facebook_login_oauth" as const;

export type FacebookTokenSource = "connected_account" | "environment_fallback";

export type FacebookPagePublic = {
  pageId: string;
  pageName: string;
  tasks: string[];
  eligible: boolean;
  ineligibleReason: string | null;
};

export type FacebookSocialAccountRow = {
  id: string;
  provider: string;
  account_name: string | null;
  account_id: string | null;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  connected_by: string | null;
  connected_at: string | null;
  last_sync: string | null;
  last_publish_at: string | null;
  status: string;
  health: string;
  metadata: Record<string, unknown> | null;
};

function toPublicPages(pages: FacebookDiscoveredPage[]): FacebookPagePublic[] {
  return pages.map((p) => ({
    pageId: p.pageId,
    pageName: p.pageName,
    tasks: p.tasks,
    eligible: p.eligible,
    ineligibleReason: p.ineligibleReason,
  }));
}

async function loadFacebookSocialAccount(): Promise<FacebookSocialAccountRow | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data } = await admin
    .from("social_accounts")
    .select(
      "id, provider, account_name, account_id, access_token, refresh_token, expires_at, connected_by, connected_at, last_sync, last_publish_at, status, health, metadata",
    )
    .eq("provider", "facebook")
    .maybeSingle();
  return (data as FacebookSocialAccountRow | null) ?? null;
}

/** Strip secrets for API / UI responses. */
export function sanitizeFacebookSocialAccount(row: FacebookSocialAccountRow | null): {
  connected: boolean;
  status: string;
  health: string;
  accountName: string | null;
  pageIdMasked: string | null;
  pageId: string | null;
  lastSync: string | null;
  lastPublishAt: string | null;
  connectedBy: string | null;
  connectedAt: string | null;
  lastError: string | null;
  lastVerifiedAt: string | null;
  pages: FacebookPagePublic[];
  authModel: string | null;
} | null {
  if (!row) return null;
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const pages = Array.isArray(meta.pages) ? (meta.pages as FacebookPagePublic[]) : [];
  return {
    connected: row.status === "connected" || row.status === "pending_location",
    status: row.status,
    health: row.health,
    accountName: row.account_name,
    pageId: row.account_id,
    pageIdMasked: maskFacebookPageId(row.account_id),
    lastSync: row.last_sync,
    lastPublishAt: row.last_publish_at,
    connectedBy: row.connected_by,
    connectedAt: row.connected_at,
    lastError: typeof meta.lastError === "string" ? meta.lastError : null,
    lastVerifiedAt: typeof meta.lastVerifiedAt === "string" ? meta.lastVerifiedAt : row.last_sync,
    pages,
    authModel: typeof meta.authModel === "string" ? meta.authModel : null,
  };
}

/**
 * Persist OAuth result: encrypt tokens, store Page list without secrets.
 * Zero eligible pages → fail. One eligible → auto-connect. Multiple → pending_location.
 */
export async function saveFacebookOAuthConnection(args: {
  userAccessToken: string;
  expiresIn?: number | null;
  connectedBy: string;
  correlationId: string;
  pages: FacebookDiscoveredPage[];
  /** Meta app-scoped user id — stored only as a non-reversible hash for deletion correlation. */
  metaUserIdHash?: string | null;
}): Promise<
  | {
      ok: true;
      needsPagePick: boolean;
      eligibleCount: number;
      account: FacebookSocialAccountRow;
    }
  | {
      ok: false;
      error: string;
      failureStage?: FacebookCallbackFailureStage;
      dbErrorCode?: string | null;
    }
> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return {
      ok: false,
      error: "Server configuration error.",
      failureStage: "upsert",
      dbErrorCode: "supabase_admin_unavailable",
    };
  }

  const eligible = args.pages.filter((p) => p.eligible);
  if (args.pages.length === 0) {
    return { ok: false, error: "No Facebook Pages were found for this account (me/accounts returned empty)." };
  }
  if (eligible.length === 0) {
    return {
      ok: false,
      error: "None of the discovered Pages grant publish permission (CREATE_CONTENT or MANAGE).",
    };
  }

  const single = eligible.length === 1 ? eligible[0]! : null;
  const status = single ? "connected" : "pending_location";
  const now = new Date().toISOString();
  const expiresAt =
    args.expiresIn && args.expiresIn > 0
      ? new Date(Date.now() + args.expiresIn * 1000).toISOString()
      : null;

  const publicPages = toPublicPages(args.pages);
  let encryptedUserToken: string;
  let encryptedPageToken: string | null;
  try {
    encryptedUserToken = encryptSecret(args.userAccessToken);
    encryptedPageToken = single ? encryptSecret(single.accessToken) : null;
  } catch (e) {
    const message =
      e instanceof TokenEncryptionConfigError
        ? e.message
        : e instanceof Error
          ? e.message
          : "Token encryption failed.";
    logFacebookOAuthEvent("save_connection_failed", {
      correlationId: args.correlationId,
      failureStage: "encrypt",
      errorName: e instanceof Error ? e.name : "Error",
    });
    return { ok: false, error: message, failureStage: "encrypt" };
  }

  const row = {
    provider: "facebook",
    account_name: single?.pageName ?? "Facebook Page",
    account_id: single?.pageId ?? null,
    location_name: single ? `Page ${maskFacebookPageId(single.pageId)}` : null,
    location_id: null,
    // Connected: Page token. Pending pick: user token until a Page is selected.
    access_token: encryptedPageToken ?? encryptedUserToken,
    // Keep long-lived user token for page re-discovery / select_page.
    refresh_token: encryptedUserToken,
    expires_at: expiresAt,
    connected_by: args.connectedBy,
    connected_at: now,
    last_sync: now,
    status,
    health: "healthy" as const,
    metadata: {
      authModel: FACEBOOK_AUTH_MODEL,
      pages: publicPages,
      selectedPageId: single?.pageId ?? null,
      grantedPermissions: [...FACEBOOK_OAUTH_SCOPES],
      tokenKind: single ? "page" : "user_pending",
      lastVerifiedAt: now,
      lastError: null,
      lastErrorCategory: null,
      correlationId: args.correlationId,
      /** SHA-256 prefix of Meta app-scoped user id — never store raw Meta user_id. */
      metaUserIdHash: args.metaUserIdHash ?? null,
      disconnectedBy: null,
      disconnectedAt: null,
    },
    updated_at: now,
  };

  // Unique(provider): reconnect replaces the soft-disconnected Hub-era row in place.
  const { data, error } = await admin
    .from("social_accounts")
    .upsert(row, { onConflict: "provider" })
    .select(
      "id, provider, account_name, account_id, access_token, refresh_token, expires_at, connected_by, connected_at, last_sync, last_publish_at, status, health, metadata",
    )
    .single();

  if (error) {
    logFacebookOAuthEvent("save_connection_failed", {
      correlationId: args.correlationId,
      failureStage: "upsert",
      dbErrorCode: error.code ?? null,
      // Message is PostgREST/Postgres text only — never tokens.
      error: error.message,
    });
    return {
      ok: false,
      error: error.message,
      failureStage: "upsert",
      dbErrorCode: error.code ?? null,
    };
  }

  logFacebookOAuthEvent("page_discovery_succeeded", {
    correlationId: args.correlationId,
    provider: "facebook",
    pageCount: args.pages.length,
    eligibleCount: eligible.length,
    needsPagePick: !single,
    actor: args.connectedBy,
  });

  return {
    ok: true,
    needsPagePick: !single,
    eligibleCount: eligible.length,
    account: data as FacebookSocialAccountRow,
  };
}

export async function selectFacebookPage(args: {
  pageId: string;
  actor: string;
  correlationId?: string;
  /** When replacing an existing connected Page, caller must confirm. */
  confirmReplace?: boolean;
}): Promise<{ ok: true; account: FacebookSocialAccountRow } | { ok: false; error: string }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const current = await loadFacebookSocialAccount();
  if (!current) return { ok: false, error: "Facebook is not connected. Start Connect Facebook first." };

  const existingPageId = current.account_id;
  if (
    current.status === "connected" &&
    existingPageId &&
    existingPageId !== args.pageId &&
    !args.confirmReplace
  ) {
    return {
      ok: false,
      error:
        "A Facebook Page is already connected. Confirm replacement to switch Pages (confirmReplace).",
    };
  }

  const meta = (current.metadata ?? {}) as Record<string, unknown>;
  const listed = Array.isArray(meta.pages) ? (meta.pages as FacebookPagePublic[]) : [];
  const listedMatch = listed.find((p) => p.pageId === args.pageId);
  if (listedMatch && !listedMatch.eligible) {
    return {
      ok: false,
      error: listedMatch.ineligibleReason ?? "Selected Page is not eligible for publishing.",
    };
  }

  const userTokenCipher = current.refresh_token || current.access_token;
  if (!userTokenCipher) {
    return { ok: false, error: "Missing Facebook user token. Reconnect Facebook." };
  }

  let userToken: string;
  try {
    userToken = decryptSecret(userTokenCipher);
  } catch {
    return { ok: false, error: "Could not decrypt Facebook token. Reconnect Facebook." };
  }

  const oauthCfg = getFacebookOAuthConfig();
  if (!oauthCfg) {
    return { ok: false, error: "Facebook OAuth is not configured." };
  }

  const discovered = await discoverFacebookPages(oauthCfg, userToken);
  if (!discovered.ok) {
    return { ok: false, error: discovered.error };
  }

  const match = discovered.pages.find((p) => p.pageId === args.pageId);
  if (!match) {
    return { ok: false, error: "Selected Page was not found. Reconnect Facebook and try again." };
  }
  if (!match.eligible) {
    return {
      ok: false,
      error: match.ineligibleReason ?? "Selected Page is not eligible for publishing.",
    };
  }

  const now = new Date().toISOString();
  const correlationId = args.correlationId ?? `fb-select-${now}`;
  const { data, error } = await admin
    .from("social_accounts")
    .update({
      account_name: match.pageName,
      account_id: match.pageId,
      location_name: `Page ${maskFacebookPageId(match.pageId)}`,
      access_token: encryptSecret(match.accessToken),
      refresh_token: encryptSecret(userToken),
      status: "connected",
      health: "healthy",
      last_sync: now,
      connected_by: args.actor,
      metadata: {
        ...meta,
        authModel: FACEBOOK_AUTH_MODEL,
        pages: toPublicPages(discovered.pages),
        selectedPageId: match.pageId,
        grantedPermissions: [...FACEBOOK_OAUTH_SCOPES],
        tokenKind: "page",
        lastVerifiedAt: now,
        lastError: null,
        lastErrorCategory: null,
        correlationId,
        replacedPageId: existingPageId && existingPageId !== match.pageId ? existingPageId : null,
      },
      updated_at: now,
    })
    .eq("id", current.id)
    .select(
      "id, provider, account_name, account_id, access_token, refresh_token, expires_at, connected_by, connected_at, last_sync, last_publish_at, status, health, metadata",
    )
    .single();

  if (error) return { ok: false, error: error.message };

  logFacebookOAuthEvent("page_selected", {
    correlationId,
    provider: "facebook",
    pageIdMasked: maskFacebookPageId(match.pageId),
    actor: args.actor,
    replaced: Boolean(existingPageId && existingPageId !== match.pageId),
  });

  return { ok: true, account: data as FacebookSocialAccountRow };
}

export async function disconnectFacebookConnection(args: {
  actor: string;
  correlationId?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const current = await loadFacebookSocialAccount();
  if (!current) return { ok: true };

  const now = new Date().toISOString();
  const correlationId = args.correlationId ?? `fb-disconnect-${now}`;
  const meta = (current.metadata ?? {}) as Record<string, unknown>;

  // Soft-disconnect: cryptographically destroy token material, keep row for audit fields.
  const { error } = await admin
    .from("social_accounts")
    .update({
      access_token: null,
      refresh_token: null,
      expires_at: null,
      status: "disconnected",
      health: "unknown",
      metadata: {
        ...meta,
        tokenKind: null,
        lastError: null,
        lastErrorCategory: null,
        disconnectedBy: args.actor,
        disconnectedAt: now,
        correlationId,
        tokenDestroyedAt: now,
      },
      updated_at: now,
    })
    .eq("id", current.id);

  if (error) return { ok: false, error: error.message };

  logFacebookOAuthEvent("disconnect_completed", {
    correlationId,
    provider: "facebook",
    pageIdMasked: maskFacebookPageId(current.account_id),
    actor: args.actor,
  });

  return { ok: true };
}

export async function markFacebookConnectionAuthFailure(args: {
  category: string;
  message: string;
  correlationId?: string;
}): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const current = await loadFacebookSocialAccount();
  if (!current || current.status === "disconnected") return;

  const now = new Date().toISOString();
  const meta = (current.metadata ?? {}) as Record<string, unknown>;
  await admin
    .from("social_accounts")
    .update({
      status: "error",
      health: "error",
      metadata: {
        ...meta,
        lastError: args.message.slice(0, 500),
        lastErrorCategory: args.category,
        lastAuthFailureAt: now,
        correlationId: args.correlationId ?? meta.correlationId ?? null,
      },
      updated_at: now,
    })
    .eq("id", current.id);

  logFacebookOAuthEvent("reconnect_required", {
    correlationId: args.correlationId ?? null,
    provider: "facebook",
    pageIdMasked: maskFacebookPageId(current.account_id),
    errorCategory: args.category,
  });
}

export async function getFacebookConnectionPublic(): Promise<{
  oauthConfigured: boolean;
  envFallbackAllowed: boolean;
  account: ReturnType<typeof sanitizeFacebookSocialAccount>;
}> {
  const row = await loadFacebookSocialAccount();
  return {
    oauthConfigured: Boolean(getFacebookOAuthConfig()),
    envFallbackAllowed: isFacebookEnvTokenFallbackAllowed(),
    account: sanitizeFacebookSocialAccount(row),
  };
}

/**
 * Resolve publish config:
 * 1) Active encrypted Connected Accounts record
 * 2) Explicit emergency/local env fallback when allowed
 * 3) Fail closed
 */
export async function resolveFacebookPublishConfig(): Promise<
  | { ok: true; config: FacebookPublishConfig; source: FacebookTokenSource }
  | { ok: false; error: string; status?: number }
> {
  const graphVersion = getFacebookGraphApiVersion();
  const admin = getSupabaseAdmin();

  if (admin) {
    const { data } = await admin
      .from("social_accounts")
      .select("account_id, access_token, status, health, metadata, account_name")
      .eq("provider", "facebook")
      .maybeSingle();

    if (data?.status === "pending_location") {
      return {
        ok: false,
        error: "Facebook is connected but a Page has not been selected yet.",
      };
    }

    if (data?.status === "error") {
      const meta = (data.metadata ?? {}) as Record<string, unknown>;
      return {
        ok: false,
        status: 401,
        error:
          (typeof meta.lastError === "string" && meta.lastError) ||
          "Facebook connection needs attention. Reconnect Facebook from Connected Accounts.",
      };
    }

    if (data?.account_id && data.access_token && data.status === "connected") {
      try {
        const token = decryptSecret(data.access_token);
        logFacebookOAuthEvent("token_resolved", {
          provider: "facebook",
          source: "connected_account",
          pageIdMasked: maskFacebookPageId(String(data.account_id)),
        });
        return {
          ok: true,
          source: "connected_account",
          config: {
            pageId: String(data.account_id),
            accessToken: token,
            graphVersion,
          },
        };
      } catch {
        // fall through to env fallback policy
      }
    }
  }

  if (!isFacebookEnvTokenFallbackAllowed()) {
    return {
      ok: false,
      error:
        "Facebook is not connected. Use Connect Facebook on Connected Accounts (env Page tokens are fallback-only and currently disabled).",
    };
  }

  const pageId =
    process.env.FACEBOOK_PAGE_ID?.trim() || process.env.META_FACEBOOK_PAGE_ID?.trim() || "";
  const accessToken =
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim() ||
    process.env.META_FACEBOOK_PAGE_ACCESS_TOKEN?.trim() ||
    "";
  if (!pageId || !accessToken) {
    return {
      ok: false,
      error:
        "Facebook is not connected and env fallback is enabled but FACEBOOK_PAGE_ID / FACEBOOK_PAGE_ACCESS_TOKEN are missing.",
    };
  }

  logFacebookOAuthEvent("fallback_token_used", {
    provider: "facebook",
    source: "environment_fallback",
    pageIdMasked: maskFacebookPageId(pageId),
  });

  return {
    ok: true,
    source: "environment_fallback",
    config: { pageId, accessToken, graphVersion },
  };
}
