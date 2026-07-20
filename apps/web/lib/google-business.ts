import "server-only";

import { randomUUID } from "crypto";
import {
  getGoogleOAuthConfig,
  refreshGoogleAccessToken,
  type GoogleOAuthConfig,
} from "@/lib/oauth/googleBusinessOAuth";
import { decryptSecret, encryptSecret, needsReEncryption } from "@/lib/security/tokenEncryption";
import { assertSafeHttpUrl, SafeMediaUrlError } from "@/lib/security/safeRemoteMedia";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  CAMPAIGN_MEDIA_BUCKET,
  CAMPAIGN_MEDIA_MAX_BYTES,
  buildCampaignMediaPublicUrl,
  campaignMediaExtensionForMime,
} from "@/lib/promotions/campaignMediaStorage";

const ACCOUNT_MGMT_BASE = "https://mybusinessaccountmanagement.googleapis.com/v1";
const BUSINESS_INFO_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1";
const LOCAL_POSTS_BASE = "https://mybusiness.googleapis.com/v4";

const LOCATION_READ_MASK = "name,title,storeCode,storefrontAddress,websiteUri,metadata";

export type GoogleBusinessAccount = {
  name: string;
  accountName: string;
  type?: string;
  verificationState?: string;
};

export type GoogleBusinessLocation = {
  /** Resource name from Business Information API: `locations/{locationId}` */
  name: string;
  locationId: string;
  title: string;
  storeCode?: string | null;
  addressLine?: string | null;
  accountId: string;
  accountName: string;
};

export type GoogleBusinessPublishResult =
  | {
      ok: true;
      postName: string;
      searchUrl?: string | null;
      apiResponse: Record<string, unknown>;
    }
  | { ok: false; error: string; status?: number; apiResponse?: Record<string, unknown> };

export type SocialAccountRow = {
  id: string;
  provider: string;
  account_name: string | null;
  account_id: string | null;
  location_name: string | null;
  location_id: string | null;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  connected_by: string | null;
  connected_at: string;
  last_sync: string | null;
  last_publish_at: string | null;
  status: "connected" | "pending_location" | "error" | "disconnected";
  health: "healthy" | "degraded" | "error" | "unknown";
  metadata: Record<string, unknown>;
};

type GoogleApiErrorBody = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: unknown[];
  };
};

function logGbp(event: string, payload: Record<string, unknown> = {}) {
  console.info("[gbp]", event, payload);
}

/** Map Google API / OAuth errors to admin-friendly copy. */
export function formatGoogleBusinessError(
  err: GoogleApiErrorBody["error"] | undefined,
  httpStatus: number,
  fallback?: string,
): string {
  const raw = (err?.message ?? fallback ?? "").trim();
  const lower = raw.toLowerCase();
  const status = err?.status?.toUpperCase() ?? "";

  if (
    httpStatus === 401 ||
    status === "UNAUTHENTICATED" ||
    lower.includes("invalid_grant") ||
    lower.includes("token has been expired or revoked")
  ) {
    return "Google access was revoked or the refresh token expired. Reconnect Google Business Profile from Connected Accounts.";
  }

  if (
    httpStatus === 403 ||
    status === "PERMISSION_DENIED" ||
    lower.includes("permission") ||
    lower.includes("insufficient")
  ) {
    return (
      (raw || "Missing Google Business Profile permissions.") +
      " Ensure the Google account manages this location and that the Business Profile APIs are enabled with the business.manage scope."
    );
  }

  if (httpStatus === 429 || status === "RESOURCE_EXHAUSTED" || lower.includes("rate")) {
    return "Google rate limit reached. Wait a minute and try again.";
  }

  if (httpStatus === 404 || status === "NOT_FOUND") {
    return (
      raw ||
      "Google Business location was not found. Pick a location again from Connected Accounts."
    );
  }

  if (httpStatus === 409 || status === "ABORTED" || status === "ALREADY_EXISTS") {
    return (
      raw ||
      "Google reported a conflict for this publish. Wait a moment, then retry or change the content."
    );
  }

  if (httpStatus === 422 || status === "INVALID_ARGUMENT" || status === "FAILED_PRECONDITION") {
    return (
      (raw || "Google rejected this post content.") +
      " Check the message, image URL, and call-to-action link, then try again."
    );
  }

  if (httpStatus === 408 || httpStatus === 504 || lower.includes("timeout") || lower.includes("deadline")) {
    return (raw || "Google Business request timed out.") + " Retry shortly.";
  }

  if (httpStatus === 500 || httpStatus === 502 || httpStatus === 503 || status === "UNAVAILABLE") {
    return (raw || `Google Business is temporarily unavailable (${httpStatus}).`) + " Retry shortly.";
  }

  if (raw) return raw;
  return `Google Business API error (${httpStatus}).`;
}

function extractLocationId(resourceName: string): string {
  const parts = resourceName.split("/");
  const idx = parts.indexOf("locations");
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1]!;
  return resourceName;
}

function extractAccountId(resourceName: string): string {
  const parts = resourceName.split("/");
  const idx = parts.indexOf("accounts");
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1]!;
  return resourceName.replace(/^accounts\//, "");
}

async function googleFetch<T>(
  accessToken: string,
  url: string,
  init?: RequestInit,
): Promise<
  { ok: true; data: T; status: number } | { ok: false; error: string; status: number; data?: T }
> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
    const json = (await res.json().catch(() => ({}))) as T & GoogleApiErrorBody;
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: formatGoogleBusinessError(json.error, res.status),
        data: json as T,
      };
    }
    return { ok: true, status: res.status, data: json as T };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: e instanceof Error ? e.message : "Network error reaching Google Business APIs.",
    };
  }
}

/** List Business Profile accounts for the authenticated user. */
export async function listGoogleBusinessAccounts(
  accessToken: string,
): Promise<{ ok: true; accounts: GoogleBusinessAccount[] } | { ok: false; error: string }> {
  const result = await googleFetch<{ accounts?: Array<Record<string, unknown>> }>(
    accessToken,
    `${ACCOUNT_MGMT_BASE}/accounts`,
  );
  if (!result.ok) {
    logGbp("list_accounts_failed", { error: result.error, status: result.status });
    return { ok: false, error: result.error };
  }
  const accounts = (result.data.accounts ?? []).map((a) => ({
    name: String(a.name ?? ""),
    accountName: String(a.accountName ?? a.name ?? "Google Business Account"),
    type: a.type != null ? String(a.type) : undefined,
    verificationState: a.verificationState != null ? String(a.verificationState) : undefined,
  }));
  logGbp("list_accounts_ok", { count: accounts.length });
  return { ok: true, accounts };
}

/** List locations for one account (Business Information API). */
export async function listGoogleBusinessLocationsForAccount(
  accessToken: string,
  accountResourceName: string,
  accountDisplayName: string,
): Promise<{ ok: true; locations: GoogleBusinessLocation[] } | { ok: false; error: string }> {
  const accountId = extractAccountId(accountResourceName);
  const locations: GoogleBusinessLocation[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < 20; page++) {
    const url = new URL(`${BUSINESS_INFO_BASE}/${accountResourceName}/locations`);
    url.searchParams.set("readMask", LOCATION_READ_MASK);
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const result = await googleFetch<{
      locations?: Array<Record<string, unknown>>;
      nextPageToken?: string;
    }>(accessToken, url.toString());

    if (!result.ok) {
      logGbp("list_locations_failed", {
        accountId,
        error: result.error,
        status: result.status,
      });
      return { ok: false, error: result.error };
    }

    for (const loc of result.data.locations ?? []) {
      const name = String(loc.name ?? "");
      if (!name) continue;
      const address = loc.storefrontAddress as
        | { addressLines?: string[]; locality?: string }
        | undefined;
      const addressLine =
        [address?.addressLines?.[0], address?.locality].filter(Boolean).join(", ") || null;
      locations.push({
        name,
        locationId: extractLocationId(name),
        title: String(loc.title ?? "Untitled location"),
        storeCode: loc.storeCode != null ? String(loc.storeCode) : null,
        addressLine,
        accountId,
        accountName: accountDisplayName,
      });
    }

    pageToken = result.data.nextPageToken;
    if (!pageToken) break;
  }

  logGbp("list_locations_ok", { accountId, count: locations.length });
  return { ok: true, locations };
}

/** List all locations across all accounts the user can manage. */
export async function listAllGoogleBusinessLocations(
  accessToken: string,
): Promise<
  | { ok: true; locations: GoogleBusinessLocation[]; accounts: GoogleBusinessAccount[] }
  | { ok: false; error: string }
> {
  const accountsRes = await listGoogleBusinessAccounts(accessToken);
  if (!accountsRes.ok) return accountsRes;

  const locations: GoogleBusinessLocation[] = [];
  for (const account of accountsRes.accounts) {
    if (!account.name) continue;
    const locs = await listGoogleBusinessLocationsForAccount(
      accessToken,
      account.name,
      account.accountName,
    );
    if (!locs.ok) {
      logGbp("list_locations_account_skipped", { account: account.name, error: locs.error });
      continue;
    }
    locations.push(...locs.locations);
  }

  if (!locations.length && accountsRes.accounts.length) {
    return {
      ok: false,
      error:
        "No Google Business locations were found. Confirm this Google account manages at least one Business Profile location.",
    };
  }

  return { ok: true, locations, accounts: accountsRes.accounts };
}

async function loadGoogleSocialAccount(): Promise<SocialAccountRow | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin
    .from("social_accounts")
    .select("*")
    .eq("provider", "google_business")
    .maybeSingle();
  if (error) {
    logGbp("load_account_failed", { error: error.message });
    throw new Error(error.message);
  }
  return (data as SocialAccountRow | null) ?? null;
}

async function persistTokens(args: {
  id: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresIn?: number;
  patch?: Partial<SocialAccountRow>;
}): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Server configuration error.");
  const expiresAt =
    args.expiresIn && args.expiresIn > 0
      ? new Date(Date.now() + args.expiresIn * 1000).toISOString()
      : undefined;
  const update: Record<string, unknown> = {
    access_token: encryptSecret(args.accessToken),
    updated_at: new Date().toISOString(),
    last_sync: new Date().toISOString(),
    ...(args.patch ?? {}),
  };
  if (expiresAt) update.expires_at = expiresAt;
  if (args.refreshToken) update.refresh_token = encryptSecret(args.refreshToken);

  const { error } = await admin.from("social_accounts").update(update).eq("id", args.id);
  if (error) throw new Error(error.message);
}

/**
 * Best-effort migration of stored tokens to the current encryption key.
 * Runs when a valid token is read; never logs token values or throws.
 */
async function maybeReEncryptStoredTokens(account: SocialAccountRow): Promise<void> {
  try {
    const patch: Record<string, unknown> = {};
    if (account.access_token && needsReEncryption(account.access_token)) {
      patch.access_token = encryptSecret(decryptSecret(account.access_token));
    }
    if (account.refresh_token && needsReEncryption(account.refresh_token)) {
      patch.refresh_token = encryptSecret(decryptSecret(account.refresh_token));
    }
    if (Object.keys(patch).length === 0) return;
    const admin = getSupabaseAdmin();
    if (!admin) return;
    patch.updated_at = new Date().toISOString();
    await admin.from("social_accounts").update(patch).eq("id", account.id);
    logGbp("tokens_reencrypted", { accountId: account.id, fields: Object.keys(patch) });
  } catch (e) {
    logGbp("tokens_reencrypt_failed", { error: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * Ensure a valid access token for the stored Google Business connection.
 * Refreshes automatically when expired (or within 60s of expiry).
 */
export async function getValidGoogleBusinessAccessToken(): Promise<
  | { ok: true; accessToken: string; account: SocialAccountRow }
  | { ok: false; error: string }
> {
  const cfg = getGoogleOAuthConfig();
  if (!cfg) {
    return {
      ok: false,
      error:
        "Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.",
    };
  }

  let account: SocialAccountRow | null;
  try {
    account = await loadGoogleSocialAccount();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not load social account." };
  }

  if (!account || account.status === "disconnected") {
    return { ok: false, error: "Google Business Profile is not connected." };
  }
  if (!account.refresh_token) {
    return {
      ok: false,
      error: "Google refresh token is missing. Reconnect Google Business Profile.",
    };
  }

  const expiresAtMs = account.expires_at ? Date.parse(account.expires_at) : 0;
  const stillValid =
    account.access_token && Number.isFinite(expiresAtMs) && expiresAtMs - Date.now() > 60_000;

  if (stillValid && account.access_token) {
    try {
      const accessToken = decryptSecret(account.access_token);
      // Opportunistically migrate legacy/previous-key ciphertext to the current key.
      await maybeReEncryptStoredTokens(account);
      return {
        ok: true,
        accessToken,
        account,
      };
    } catch {
      // fall through to refresh
    }
  }

  try {
    const refreshToken = decryptSecret(account.refresh_token);
    logGbp("token_refresh_start", { accountId: account.id });
    const tokens = await refreshGoogleAccessToken(cfg, refreshToken);
    await persistTokens({
      id: account.id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresIn: tokens.expires_in,
      patch: {
        health: "healthy",
        status: account.status === "error" ? "connected" : account.status,
      },
    });
    const refreshed = await loadGoogleSocialAccount();
    if (!refreshed) return { ok: false, error: "Token refresh succeeded but account reload failed." };
    logGbp("token_refresh_ok", { accountId: account.id });
    return { ok: true, accessToken: tokens.access_token, account: refreshed };
  } catch (e) {
    const message = formatGoogleBusinessError(
      undefined,
      401,
      e instanceof Error ? e.message : "Token refresh failed.",
    );
    logGbp("token_refresh_failed", { error: message });
    const admin = getSupabaseAdmin();
    if (admin) {
      await admin
        .from("social_accounts")
        .update({
          health: "error",
          status: "error",
          metadata: {
            ...(account.metadata ?? {}),
            lastError: message,
            lastErrorAt: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", account.id);
    }
    return { ok: false, error: message };
  }
}

/** Authenticated Google API call with one automatic retry after token refresh. */
async function withGoogleAccess<T>(
  run: (accessToken: string, account: SocialAccountRow) => Promise<T>,
): Promise<T> {
  const first = await getValidGoogleBusinessAccessToken();
  if (!first.ok) throw new Error(first.error);
  try {
    return await run(first.accessToken, first.account);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/401|unauthenticated|invalid_grant|revoked/i.test(msg)) throw e;
    logGbp("retry_after_auth_error", { error: msg });
    const second = await getValidGoogleBusinessAccessToken();
    if (!second.ok) throw new Error(second.error);
    return run(second.accessToken, second.account);
  }
}

/**
 * Upsert the Google Business social_accounts row after OAuth callback.
 * If multiple locations exist, status stays `pending_location` until the admin picks one.
 */
export async function saveGoogleBusinessConnection(args: {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  connectedBy: string;
  existingRefreshToken?: string | null;
}): Promise<
  | {
      ok: true;
      account: SocialAccountRow;
      locations: GoogleBusinessLocation[];
      needsLocationPick: boolean;
    }
  | { ok: false; error: string }
> {
  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const listed = await listAllGoogleBusinessLocations(args.accessToken);
  if (!listed.ok) return listed;

  const refreshToken = args.refreshToken || args.existingRefreshToken;
  if (!refreshToken) {
    return {
      ok: false,
      error:
        "Google did not return a refresh token. Disconnect the app from Google Account permissions and reconnect with consent.",
    };
  }

  const single = listed.locations.length === 1 ? listed.locations[0]! : null;
  const status = single ? "connected" : "pending_location";
  const expiresAt = new Date(Date.now() + Math.max(args.expiresIn, 60) * 1000).toISOString();
  const now = new Date().toISOString();
  const firstAccount = listed.accounts[0];

  const row = {
    provider: "google_business",
    account_name: single?.accountName ?? firstAccount?.accountName ?? "Google Business",
    account_id: single?.accountId ?? (firstAccount ? extractAccountId(firstAccount.name) : null),
    location_name: single?.title ?? null,
    location_id: single?.locationId ?? null,
    access_token: encryptSecret(args.accessToken),
    refresh_token: encryptSecret(refreshToken),
    expires_at: expiresAt,
    connected_by: args.connectedBy,
    connected_at: now,
    last_sync: now,
    status,
    health: "healthy" as const,
    metadata: {
      accounts: listed.accounts,
      locations: listed.locations,
      selectedLocationResource: single
        ? `accounts/${single.accountId}/locations/${single.locationId}`
        : null,
    },
    updated_at: now,
  };

  const { data, error } = await admin
    .from("social_accounts")
    .upsert(row, { onConflict: "provider" })
    .select("*")
    .single();

  if (error) {
    logGbp("save_connection_failed", { error: error.message });
    return { ok: false, error: error.message };
  }

  logGbp("save_connection_ok", {
    status,
    locationCount: listed.locations.length,
    connectedBy: args.connectedBy,
  });

  return {
    ok: true,
    account: data as SocialAccountRow,
    locations: listed.locations,
    needsLocationPick: !single,
  };
}

export async function selectGoogleBusinessLocation(args: {
  locationId: string;
  accountId?: string | null;
}): Promise<{ ok: true; account: SocialAccountRow } | { ok: false; error: string }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const current = await loadGoogleSocialAccount();
  if (!current) return { ok: false, error: "Google Business Profile is not connected." };

  const locations = (current.metadata?.locations as GoogleBusinessLocation[] | undefined) ?? [];
  const match = locations.find(
    (l) =>
      l.locationId === args.locationId &&
      (!args.accountId || l.accountId === args.accountId),
  );
  if (!match) {
    return { ok: false, error: "Selected location was not found. Refresh locations and try again." };
  }

  const { data, error } = await admin
    .from("social_accounts")
    .update({
      account_name: match.accountName,
      account_id: match.accountId,
      location_name: match.title,
      location_id: match.locationId,
      status: "connected",
      health: "healthy",
      last_sync: new Date().toISOString(),
      metadata: {
        ...(current.metadata ?? {}),
        selectedLocationResource: `accounts/${match.accountId}/locations/${match.locationId}`,
        lastError: null,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", current.id)
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message };
  logGbp("location_selected", { locationId: match.locationId, accountId: match.accountId });
  return { ok: true, account: data as SocialAccountRow };
}

export async function refreshGoogleBusinessLocations(): Promise<
  | { ok: true; account: SocialAccountRow; locations: GoogleBusinessLocation[] }
  | { ok: false; error: string }
> {
  try {
    return await withGoogleAccess(async (accessToken, account) => {
      const listed = await listAllGoogleBusinessLocations(accessToken);
      if (!listed.ok) return listed;

      const adminDb = getSupabaseAdmin();
      if (!adminDb) return { ok: false, error: "Server configuration error." };

      const stillSelected = listed.locations.find(
        (l) => l.locationId === account.location_id && l.accountId === account.account_id,
      );
      const only = listed.locations.length === 1 ? listed.locations[0]! : null;

      const { data, error } = await adminDb
        .from("social_accounts")
        .update({
          last_sync: new Date().toISOString(),
          health: "healthy",
          status: stillSelected || only ? "connected" : "pending_location",
          location_name: stillSelected?.title ?? only?.title ?? account.location_name,
          location_id: stillSelected?.locationId ?? only?.locationId ?? account.location_id,
          account_id: stillSelected?.accountId ?? only?.accountId ?? account.account_id,
          account_name: stillSelected?.accountName ?? only?.accountName ?? account.account_name,
          metadata: {
            ...(account.metadata ?? {}),
            accounts: listed.accounts,
            locations: listed.locations,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", account.id)
        .select("*")
        .single();

      if (error) return { ok: false, error: error.message };
      return { ok: true, account: data as SocialAccountRow, locations: listed.locations };
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Refresh failed." };
  }
}

export async function disconnectGoogleBusiness(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, error: "Server configuration error." };
  const { error } = await admin.from("social_accounts").delete().eq("provider", "google_business");
  if (error) return { ok: false, error: error.message };
  logGbp("disconnected", {});
  return { ok: true };
}

/** Public URL required by Local Posts media (sourceUrl only — no binary upload for posts). */
export async function ensurePublicImageUrlForGooglePost(args: {
  imageUrl?: string | null;
  imageDataUrl?: string | null;
  promotionId?: string | null;
}): Promise<{ ok: true; imageUrl: string } | { ok: false; error: string }> {
  if (args.imageUrl?.startsWith("https://")) {
    // Google fetches this sourceUrl server-side; validate it is a safe public
    // https host (blocks loopback/private/link-local/metadata) before forwarding.
    try {
      assertSafeHttpUrl(args.imageUrl);
    } catch (e) {
      const message =
        e instanceof SafeMediaUrlError
          ? e.message
          : "The image URL is not allowed for Google Business.";
      return { ok: false, error: message };
    }
    return { ok: true, imageUrl: args.imageUrl };
  }

  if (!args.imageDataUrl?.startsWith("data:image/")) {
    return { ok: false, error: "An image is required to publish to Google Business." };
  }

  const match = args.imageDataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i);
  if (!match) {
    return { ok: false, error: "Invalid image data URL (expected PNG/JPEG/WebP base64)." };
  }
  const mime = match[1]!.toLowerCase() === "image/jpg" ? "image/jpeg" : match[1]!.toLowerCase();
  const ext = campaignMediaExtensionForMime(mime);
  if (!ext) return { ok: false, error: "Unsupported image type for Google Business." };

  const buffer = Buffer.from(match[2]!, "base64");
  if (buffer.length < 100) return { ok: false, error: "Image payload too small." };
  if (buffer.length > CAMPAIGN_MEDIA_MAX_BYTES) {
    return { ok: false, error: "Image must be under 8MB." };
  }

  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const objectPath = `gbp-publish/${args.promotionId ?? "adhoc"}/${randomUUID()}.${ext}`;
  const { error: uploadError } = await admin.storage.from(CAMPAIGN_MEDIA_BUCKET).upload(objectPath, buffer, {
    contentType: mime,
    upsert: false,
  });
  if (uploadError) {
    logGbp("media_upload_failed", { error: uploadError.message });
    return { ok: false, error: uploadError.message };
  }

  const publicUrl = buildCampaignMediaPublicUrl(objectPath);
  if (!publicUrl) return { ok: false, error: "Could not build public image URL." };
  return { ok: true, imageUrl: publicUrl };
}

/**
 * Create a STANDARD local post on the connected Google Business location.
 * Media must be a publicly reachable HTTPS URL (Google fetches it server-side).
 */
export async function createGoogleBusinessLocalPost(args: {
  summary: string;
  imageUrl: string;
  callToActionUrl?: string | null;
}): Promise<GoogleBusinessPublishResult> {
  const tokenRes = await getValidGoogleBusinessAccessToken();
  if (!tokenRes.ok) return { ok: false, error: tokenRes.error };

  const { account, accessToken } = tokenRes;
  if (account.status !== "connected" || !account.account_id || !account.location_id) {
    return {
      ok: false,
      error: "Select a Google Business location in Connected Accounts before publishing.",
    };
  }

  const parent = `accounts/${account.account_id}/locations/${account.location_id}`;
  const body: Record<string, unknown> = {
    languageCode: "en",
    summary: args.summary.trim().slice(0, 1500),
    topicType: "STANDARD",
    media: [
      {
        mediaFormat: "PHOTO",
        sourceUrl: args.imageUrl,
      },
    ],
  };

  if (args.callToActionUrl?.trim()) {
    body.callToAction = {
      actionType: "LEARN_MORE",
      url: args.callToActionUrl.trim(),
    };
  }

  logGbp("local_post_create_start", { parent });

  const attempt = async (token: string) =>
    googleFetch<Record<string, unknown>>(token, `${LOCAL_POSTS_BASE}/${parent}/localPosts`, {
      method: "POST",
      body: JSON.stringify(body),
    });

  let result = await attempt(accessToken);
  if (!result.ok && (result.status === 401 || /revoked|unauthenticated/i.test(result.error))) {
    const refreshed = await getValidGoogleBusinessAccessToken();
    if (refreshed.ok) result = await attempt(refreshed.accessToken);
  }

  if (!result.ok) {
    logGbp("local_post_create_failed", { error: result.error, status: result.status });
    return {
      ok: false,
      error: result.error,
      status: result.status,
      apiResponse: (result.data as Record<string, unknown>) ?? {},
    };
  }

  const postName = String(result.data.name ?? "");
  const searchUrl = result.data.searchUrl != null ? String(result.data.searchUrl) : null;

  const admin = getSupabaseAdmin();
  if (admin) {
    await admin
      .from("social_accounts")
      .update({
        last_publish_at: new Date().toISOString(),
        last_sync: new Date().toISOString(),
        health: "healthy",
        updated_at: new Date().toISOString(),
      })
      .eq("id", account.id);
  }

  logGbp("local_post_create_ok", { postName });
  return {
    ok: true,
    postName,
    searchUrl,
    apiResponse: result.data,
  };
}

/** Safe public view of a social account (no tokens). */
export function sanitizeSocialAccount(row: SocialAccountRow | null): Record<string, unknown> | null {
  if (!row) return null;
  const locations = (row.metadata?.locations as GoogleBusinessLocation[] | undefined) ?? [];
  return {
    id: row.id,
    provider: row.provider,
    accountName: row.account_name,
    accountId: row.account_id,
    locationName: row.location_name,
    locationId: row.location_id,
    connectedBy: row.connected_by,
    connectedAt: row.connected_at,
    lastSync: row.last_sync,
    lastPublishAt: row.last_publish_at,
    status: row.status,
    health: row.health,
    locations: locations.map((l) => ({
      locationId: l.locationId,
      title: l.title,
      accountId: l.accountId,
      accountName: l.accountName,
      addressLine: l.addressLine ?? null,
      storeCode: l.storeCode ?? null,
    })),
    lastError: typeof row.metadata?.lastError === "string" ? row.metadata.lastError : null,
  };
}

export async function getGoogleBusinessConnectionPublic(): Promise<{
  configured: boolean;
  connected: boolean;
  account: Record<string, unknown> | null;
  oauthConfigured: boolean;
}> {
  const oauthConfigured = getGoogleOAuthConfig() != null;
  let row: SocialAccountRow | null = null;
  try {
    row = await loadGoogleSocialAccount();
  } catch {
    row = null;
  }
  const connected = Boolean(row && row.status !== "disconnected" && row.refresh_token);
  return {
    configured: connected && row?.status === "connected",
    connected,
    account: sanitizeSocialAccount(row),
    oauthConfigured,
  };
}

export function getGoogleOAuthConfigOrThrow(): GoogleOAuthConfig {
  const cfg = getGoogleOAuthConfig();
  if (!cfg) {
    throw new Error(
      "Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.",
    );
  }
  return cfg;
}
