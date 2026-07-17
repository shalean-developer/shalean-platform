/**
 * MKT-001G — Instagram Content Publishing (Facebook Login path).
 *
 * Auth model (documented, do not mix with Instagram Login):
 * - Facebook Page access token (same source as FACEBOOK_PAGE_* env)
 * - Instagram Professional account (Business/Creator) linked to that Page
 * - Permissions: instagram_basic, instagram_content_publish, pages_show_list,
 *   pages_read_engagement (plus Page token for the linked Page)
 *
 * Initial scope: single-image feed post via media-container flow.
 * Deferred: carousels, Reels, Stories, video, product tagging, collabs.
 */

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { encryptSecret, decryptSecret } from "@/lib/security/tokenEncryption";
import { getFacebookPagePublishConfig } from "@/lib/promotions/facebookPublish";
import { canonicalizePublicSiteUrl } from "@/lib/promotions/offerCopy";

const IG_CAPTION_LIMIT = 2200;
const CONTAINER_POLL_MS = 2_000;
const CONTAINER_POLL_MAX_ATTEMPTS = 15;

export const INSTAGRAM_AUTH_MODEL = "facebook_login" as const;

type GraphErrorBody = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
};

export type InstagramPublishConfig = {
  pageId: string;
  igUserId: string;
  accessToken: string;
  graphVersion: string;
  username?: string | null;
};

export type InstagramDiscoverResult =
  | {
      ok: true;
      pageId: string;
      igUserId: string;
      username: string | null;
      name: string | null;
      accountTypeHint: "professional";
    }
  | {
      ok: false;
      error: string;
      code?:
        | "missing_page_token"
        | "no_ig_linked"
        | "personal_rejected"
        | "graph_error"
        | "permission";
      status?: number;
    };

export type InstagramPublishResult =
  | {
      ok: true;
      mediaId: string;
      containerId: string;
      permalink?: string | null;
    }
  | { ok: false; error: string; status?: number; retryable?: boolean };

function graphVersion(): string {
  return (
    process.env.FACEBOOK_GRAPH_API_VERSION?.trim() ||
    process.env.WHATSAPP_GRAPH_API_VERSION?.trim() ||
    "v22.0"
  );
}

function graphUrl(path: string, query?: Record<string, string>): string {
  const u = new URL(`https://graph.facebook.com/${graphVersion()}/${path.replace(/^\//, "")}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
  }
  return u.toString();
}

export function formatInstagramGraphError(
  err: GraphErrorBody | undefined,
  httpStatus: number,
): string {
  const raw = (err?.message ?? "").trim();
  const lower = raw.toLowerCase();

  if (
    httpStatus === 401 ||
    err?.code === 190 ||
    lower.includes("invalid oauth") ||
    lower.includes("session has expired") ||
    lower.includes("error validating access token")
  ) {
    return (
      (raw || "Instagram/Facebook access token is invalid or expired.") +
      " Reconnect via Connected Accounts or update the Page token."
    );
  }

  if (
    httpStatus === 403 ||
    err?.code === 10 ||
    err?.code === 200 ||
    lower.includes("permission") ||
    lower.includes("instagram_content_publish")
  ) {
    return (
      (raw || "Instagram permission error.") +
      " Ensure the Page token includes instagram_basic and instagram_content_publish, and a Professional account is linked to the Page."
    );
  }

  if (httpStatus === 429 || err?.code === 4 || err?.code === 17 || lower.includes("rate limit")) {
    return (raw || "Instagram rate limit reached.") + " Wait a minute and try again.";
  }

  if (lower.includes("media_id") || lower.includes("container") || lower.includes("image_url")) {
    return (
      (raw || "Instagram rejected the media container.") +
      " Use a publicly reachable JPEG/PNG image URL (data URLs are not supported)."
    );
  }

  if (httpStatus === 500 || httpStatus === 502 || httpStatus === 503) {
    return (raw || `Instagram is temporarily unavailable (${httpStatus}).`) + " Retry shortly.";
  }

  if (raw) return raw;
  return `Instagram API error (${httpStatus}).`;
}

/**
 * Discover the Instagram professional account linked to the configured Facebook Page.
 * Rejects when no IG account is linked. Personal accounts cannot publish via this API.
 */
export async function discoverInstagramProfessionalAccount(
  accessToken?: string,
  pageId?: string,
): Promise<InstagramDiscoverResult> {
  const cfg = getFacebookPagePublishConfig();
  const token = accessToken?.trim() || cfg?.accessToken || "";
  const pid = pageId?.trim() || cfg?.pageId || "";
  if (!token || !pid) {
    return {
      ok: false,
      code: "missing_page_token",
      error:
        "Facebook Page token is required for Instagram discovery. Set FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN (Facebook Login path).",
    };
  }

  try {
    const res = await fetch(
      graphUrl(pid, {
        fields: "id,name,instagram_business_account{id,username,name}",
        access_token: token,
      }),
      { method: "GET" },
    );
    const json = (await res.json().catch(() => ({}))) as {
      id?: string;
      name?: string;
      instagram_business_account?: { id?: string; username?: string; name?: string };
      error?: GraphErrorBody;
    };

    if (!res.ok || json.error) {
      const status = res.status;
      const code =
        status === 403 || json.error?.code === 10 || json.error?.code === 200
          ? "permission"
          : "graph_error";
      return {
        ok: false,
        code,
        status,
        error: formatInstagramGraphError(json.error, status),
      };
    }

    const ig = json.instagram_business_account;
    if (!ig?.id) {
      return {
        ok: false,
        code: "no_ig_linked",
        error:
          "No Instagram professional account is linked to this Facebook Page. Link a Business or Creator account in Meta Business Suite, then reconnect.",
      };
    }

    // Content Publishing API only supports professional accounts. The Page-linked
    // instagram_business_account field already excludes ordinary personal accounts.
    return {
      ok: true,
      pageId: String(json.id ?? pid),
      igUserId: String(ig.id),
      username: ig.username ?? null,
      name: ig.name ?? null,
      accountTypeHint: "professional",
    };
  } catch (e) {
    return {
      ok: false,
      code: "graph_error",
      error: e instanceof Error ? e.message : "Instagram discovery failed.",
    };
  }
}

export async function saveInstagramConnection(args: {
  connectedBy: string;
  accessToken?: string;
  pageId?: string;
}): Promise<
  | {
      ok: true;
      igUserId: string;
      username: string | null;
      pageId: string;
    }
  | { ok: false; error: string; code?: InstagramDiscoverResult extends { ok: false } ? string : never }
> {
  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, error: "Server configuration error." };

  const discovered = await discoverInstagramProfessionalAccount(args.accessToken, args.pageId);
  if (!discovered.ok) {
    return { ok: false, error: discovered.error, code: discovered.code };
  }

  const cfg = getFacebookPagePublishConfig();
  const token = args.accessToken?.trim() || cfg?.accessToken;
  if (!token) {
    return { ok: false, error: "Missing Page access token to persist." };
  }

  const now = new Date().toISOString();
  const row = {
    provider: "instagram",
    account_name: discovered.username
      ? `@${discovered.username}`
      : discovered.name ?? "Instagram",
    account_id: discovered.igUserId,
    location_name: null,
    location_id: null,
    access_token: encryptSecret(token),
    refresh_token: null,
    expires_at: null,
    connected_by: args.connectedBy,
    connected_at: now,
    last_sync: now,
    status: "connected",
    health: "healthy",
    metadata: {
      authModel: INSTAGRAM_AUTH_MODEL,
      pageId: discovered.pageId,
      igUserId: discovered.igUserId,
      username: discovered.username,
      name: discovered.name,
      accountTypeHint: discovered.accountTypeHint,
      requiredPermissions: [
        "instagram_basic",
        "instagram_content_publish",
        "pages_show_list",
        "pages_read_engagement",
      ],
    },
    updated_at: now,
  };

  const { error } = await admin.from("social_accounts").upsert(row, { onConflict: "provider" });
  if (error) {
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    igUserId: discovered.igUserId,
    username: discovered.username,
    pageId: discovered.pageId,
  };
}

export async function disconnectInstagramConnection(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, error: "Server configuration error." };
  const { error } = await admin.from("social_accounts").delete().eq("provider", "instagram");
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Resolve publish config from encrypted social_accounts row, with live rediscovery fallback.
 */
export async function resolveInstagramPublishConfig(): Promise<
  | { ok: true; config: InstagramPublishConfig }
  | { ok: false; error: string; status?: number }
> {
  const admin = getSupabaseAdmin();
  const fb = getFacebookPagePublishConfig();

  if (admin) {
    const { data } = await admin
      .from("social_accounts")
      .select("account_id, access_token, status, health, metadata, account_name")
      .eq("provider", "instagram")
      .maybeSingle();

    if (data?.account_id && data.access_token && data.status === "connected") {
      try {
        const token = decryptSecret(data.access_token);
        const meta = (data.metadata ?? {}) as Record<string, unknown>;
        return {
          ok: true,
          config: {
            pageId: String(meta.pageId ?? fb?.pageId ?? ""),
            igUserId: String(data.account_id),
            accessToken: token,
            graphVersion: graphVersion(),
            username:
              typeof meta.username === "string"
                ? meta.username
                : data.account_name?.replace(/^@/, "") ?? null,
          },
        };
      } catch {
        // fall through to live discovery
      }
    }
  }

  if (!fb) {
    return {
      ok: false,
      error:
        "Instagram is not connected. Configure the Facebook Page token and connect Instagram from Connected Accounts.",
    };
  }

  const discovered = await discoverInstagramProfessionalAccount(fb.accessToken, fb.pageId);
  if (!discovered.ok) {
    return { ok: false, error: discovered.error, status: discovered.status };
  }

  return {
    ok: true,
    config: {
      pageId: discovered.pageId,
      igUserId: discovered.igUserId,
      accessToken: fb.accessToken,
      graphVersion: graphVersion(),
      username: discovered.username,
    },
  };
}

function buildCaption(message: string, link?: string | null): string {
  const base = message.trim();
  const url = link?.trim() ? canonicalizePublicSiteUrl(link.trim()) : "";
  const caption = url && !base.includes(url) ? `${base}\n\n${url}` : base;
  return caption.slice(0, IG_CAPTION_LIMIT);
}

export function validateInstagramImageUrl(imageUrl: string | null | undefined): {
  ok: true;
  url: string;
} | { ok: false; error: string } {
  const url = imageUrl?.trim() ?? "";
  if (!url) {
    return {
      ok: false,
      error:
        "Instagram requires a publicly reachable image URL. Upload/select a campaign asset image (data URLs are not supported for the container API).",
    };
  }
  if (url.startsWith("data:")) {
    return {
      ok: false,
      error:
        "Instagram does not accept data URLs. Use a public HTTPS image URL from a campaign asset.",
    };
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { ok: false, error: "Instagram image URL must be http(s)." };
    }
  } catch {
    return { ok: false, error: "Invalid Instagram image URL." };
  }
  return { ok: true, url };
}

async function createMediaContainer(args: {
  config: InstagramPublishConfig;
  imageUrl: string;
  caption: string;
}): Promise<{ ok: true; containerId: string } | { ok: false; error: string; status?: number }> {
  const body = new URLSearchParams({
    image_url: args.imageUrl,
    caption: args.caption,
    access_token: args.config.accessToken,
  });
  const res = await fetch(graphUrl(`${args.config.igUserId}/media`), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as {
    id?: string;
    error?: GraphErrorBody;
  };
  if (!res.ok || !json.id || json.error) {
    return {
      ok: false,
      status: res.status,
      error: formatInstagramGraphError(json.error, res.status),
    };
  }
  return { ok: true, containerId: json.id };
}

async function waitForContainerReady(args: {
  config: InstagramPublishConfig;
  containerId: string;
}): Promise<{ ok: true } | { ok: false; error: string; status?: number; retryable?: boolean }> {
  for (let i = 0; i < CONTAINER_POLL_MAX_ATTEMPTS; i++) {
    const res = await fetch(
      graphUrl(args.containerId, {
        fields: "status_code,status",
        access_token: args.config.accessToken,
      }),
      { method: "GET" },
    );
    const json = (await res.json().catch(() => ({}))) as {
      status_code?: string;
      status?: string;
      error?: GraphErrorBody;
    };
    if (!res.ok || json.error) {
      return {
        ok: false,
        status: res.status,
        error: formatInstagramGraphError(json.error, res.status),
      };
    }
    const code = (json.status_code ?? "").toUpperCase();
    if (code === "FINISHED" || code === "PUBLISHED") {
      return { ok: true };
    }
    if (code === "ERROR" || code === "EXPIRED") {
      return {
        ok: false,
        error: `Instagram media container failed (${code}${json.status ? `: ${json.status}` : ""}).`,
        status: 422,
      };
    }
    // IN_PROGRESS / IN_PROGRESS_UPLOAD / unknown → wait
    await new Promise((r) => setTimeout(r, CONTAINER_POLL_MS));
  }
  return {
    ok: false,
    error: "Instagram media container did not become ready in time.",
    status: 504,
    retryable: true,
  };
}

async function publishContainer(args: {
  config: InstagramPublishConfig;
  containerId: string;
}): Promise<{ ok: true; mediaId: string } | { ok: false; error: string; status?: number }> {
  const body = new URLSearchParams({
    creation_id: args.containerId,
    access_token: args.config.accessToken,
  });
  const res = await fetch(graphUrl(`${args.config.igUserId}/media_publish`), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as {
    id?: string;
    error?: GraphErrorBody;
  };
  if (!res.ok || !json.id || json.error) {
    return {
      ok: false,
      status: res.status,
      error: formatInstagramGraphError(json.error, res.status),
    };
  }
  return { ok: true, mediaId: json.id };
}

async function fetchPermalink(args: {
  config: InstagramPublishConfig;
  mediaId: string;
}): Promise<string | null> {
  try {
    const res = await fetch(
      graphUrl(args.mediaId, {
        fields: "permalink",
        access_token: args.config.accessToken,
      }),
      { method: "GET" },
    );
    const json = (await res.json().catch(() => ({}))) as { permalink?: string };
    return json.permalink ?? null;
  } catch {
    return null;
  }
}

/**
 * Single-image feed publish lifecycle:
 * validate → create container → poll status → publish → reconcile media id / permalink
 */
export async function publishInstagramSingleImage(args: {
  message: string;
  imageUrl: string;
  link?: string | null;
}): Promise<InstagramPublishResult> {
  const image = validateInstagramImageUrl(args.imageUrl);
  if (!image.ok) {
    return { ok: false, error: image.error, status: 400 };
  }

  const resolved = await resolveInstagramPublishConfig();
  if (!resolved.ok) {
    return { ok: false, error: resolved.error, status: resolved.status ?? 400 };
  }

  const caption = buildCaption(args.message, args.link);
  if (!caption.trim()) {
    return { ok: false, error: "Caption is required.", status: 400 };
  }

  try {
    const created = await createMediaContainer({
      config: resolved.config,
      imageUrl: image.url,
      caption,
    });
    if (!created.ok) {
      return { ok: false, error: created.error, status: created.status };
    }

    const ready = await waitForContainerReady({
      config: resolved.config,
      containerId: created.containerId,
    });
    if (!ready.ok) {
      return {
        ok: false,
        error: ready.error,
        status: ready.status,
        retryable: ready.retryable,
      };
    }

    const published = await publishContainer({
      config: resolved.config,
      containerId: created.containerId,
    });
    if (!published.ok) {
      return { ok: false, error: published.error, status: published.status };
    }

    const permalink = await fetchPermalink({
      config: resolved.config,
      mediaId: published.mediaId,
    });

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
        .eq("provider", "instagram");
    }

    return {
      ok: true,
      mediaId: published.mediaId,
      containerId: created.containerId,
      permalink,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Instagram publish failed.";
    return { ok: false, error: msg, status: 503, retryable: true };
  }
}

export const INSTAGRAM_CAPTION_LIMIT = IG_CAPTION_LIMIT;
