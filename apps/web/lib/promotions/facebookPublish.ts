import "server-only";

export type FacebookPublishConfig = {
  pageId: string;
  accessToken: string;
  graphVersion: string;
};

export function getFacebookPagePublishConfig(): FacebookPublishConfig | null {
  const pageId =
    process.env.FACEBOOK_PAGE_ID?.trim() || process.env.META_FACEBOOK_PAGE_ID?.trim() || "";
  const accessToken =
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim() ||
    process.env.META_FACEBOOK_PAGE_ACCESS_TOKEN?.trim() ||
    "";
  if (!pageId || !accessToken) return null;
  const graphVersion =
    process.env.FACEBOOK_GRAPH_API_VERSION?.trim() ||
    process.env.WHATSAPP_GRAPH_API_VERSION?.trim() ||
    "v22.0";
  return { pageId, accessToken, graphVersion };
}

export type FacebookPublishResult =
  | { ok: true; postId: string; photoId?: string }
  | { ok: false; error: string; status?: number };

type GraphErrorBody = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
};

/** Map Meta Graph errors to actionable admin copy (esp. deprecated publish_actions). */
export function formatFacebookGraphError(err: GraphErrorBody | undefined, httpStatus: number): string {
  const raw = (err?.message ?? "").trim();
  const lower = raw.toLowerCase();

  if (
    lower.includes("publish_actions") ||
    (err?.code === 200 && lower.includes("permission") && lower.includes("deprecated"))
  ) {
    return [
      "Facebook rejected this token: publish_actions is deprecated and cannot publish as a user.",
      "Use a Page access token with pages_manage_posts + pages_read_engagement (not a User token).",
      "In Graph API Explorer: grant those permissions → GET /me/accounts → copy the Page's access_token into FACEBOOK_PAGE_ACCESS_TOKEN.",
      "See docs/CAMPAIGN_SOCIAL_PUBLISHING.md.",
    ].join(" ");
  }

  if (lower.includes("pages_manage_posts") || lower.includes("(#200)")) {
    return (
      (raw || "Facebook permission error (#200).") +
      " Ensure FACEBOOK_PAGE_ACCESS_TOKEN is a Page token with pages_manage_posts (from /me/accounts), not a User token."
    );
  }

  if (raw) return raw;
  return `Facebook API error (${httpStatus}).`;
}

function graphUrl(cfg: FacebookPublishConfig, path: string, query?: Record<string, string>): string {
  const u = new URL(`https://graph.facebook.com/${cfg.graphVersion}/${path.replace(/^\//, "")}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
  }
  return u.toString();
}

/**
 * Confirm FACEBOOK_PAGE_ACCESS_TOKEN is a Page token for FACEBOOK_PAGE_ID.
 * User tokens can often GET the Page but still fail publish with deprecated publish_actions.
 */
export async function assertFacebookPageToken(cfg: FacebookPublishConfig): Promise<FacebookPublishResult | null> {
  try {
    const meRes = await fetch(
      graphUrl(cfg, "me", {
        fields: "id,name",
        access_token: cfg.accessToken,
      }),
      { method: "GET" },
    );
    const me = (await meRes.json().catch(() => ({}))) as {
      id?: string;
      name?: string;
      error?: GraphErrorBody;
    };
    if (!meRes.ok || me.error || !me.id) {
      return {
        ok: false,
        status: meRes.status,
        error:
          formatFacebookGraphError(me.error, meRes.status) +
          " Could not identify the token via /me. Regenerate a Page token from GET /me/accounts.",
      };
    }

    if (String(me.id) !== String(cfg.pageId)) {
      return {
        ok: false,
        status: 400,
        error: [
          `FACEBOOK_PAGE_ACCESS_TOKEN is a User token (id ${me.id}), not a Page token.`,
          `FACEBOOK_PAGE_ID is ${cfg.pageId}.`,
          "In Graph API Explorer run GET /me/accounts and copy the Page object's access_token (not the token in the right sidebar).",
          "Then restart the app / update Vercel env and redeploy.",
        ].join(" "),
      };
    }

    const res = await fetch(
      graphUrl(cfg, cfg.pageId, {
        fields: "id,name",
        access_token: cfg.accessToken,
      }),
      { method: "GET" },
    );
    const json = (await res.json().catch(() => ({}))) as {
      id?: string;
      name?: string;
      error?: GraphErrorBody;
    };
    if (!res.ok || json.error || !json.id) {
      return {
        ok: false,
        status: res.status,
        error:
          formatFacebookGraphError(json.error, res.status) +
          " Tip: FACEBOOK_PAGE_ID must match the Page, and the token must be that Page's access_token from /me/accounts.",
      };
    }
    return null;
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to validate Facebook Page token.",
    };
  }
}

/** Admin diagnostics: is the configured token a Page token for FACEBOOK_PAGE_ID? */
export async function diagnoseFacebookPagePublishConfig(): Promise<{
  configured: boolean;
  pageId: string | null;
  tokenKind: "page" | "user" | "unknown" | null;
  tokenSubjectId: string | null;
  tokenSubjectName: string | null;
  okForPublish: boolean;
  hint: string | null;
}> {
  const cfg = getFacebookPagePublishConfig();
  if (!cfg) {
    return {
      configured: false,
      pageId: null,
      tokenKind: null,
      tokenSubjectId: null,
      tokenSubjectName: null,
      okForPublish: false,
      hint: "Set FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN.",
    };
  }

  try {
    const meRes = await fetch(
      graphUrl(cfg, "me", { fields: "id,name", access_token: cfg.accessToken }),
      { method: "GET" },
    );
    const me = (await meRes.json().catch(() => ({}))) as {
      id?: string;
      name?: string;
      error?: GraphErrorBody;
    };
    if (!meRes.ok || me.error || !me.id) {
      return {
        configured: true,
        pageId: cfg.pageId,
        tokenKind: "unknown",
        tokenSubjectId: null,
        tokenSubjectName: null,
        okForPublish: false,
        hint: formatFacebookGraphError(me.error, meRes.status),
      };
    }

    const isPage = String(me.id) === String(cfg.pageId);
    return {
      configured: true,
      pageId: cfg.pageId,
      tokenKind: isPage ? "page" : "user",
      tokenSubjectId: me.id,
      tokenSubjectName: me.name ?? null,
      okForPublish: isPage,
      hint: isPage
        ? null
        : "Token is a User token. Replace FACEBOOK_PAGE_ACCESS_TOKEN with the access_token from GET /me/accounts for this Page, then restart/redeploy.",
    };
  } catch (e) {
    return {
      configured: true,
      pageId: cfg.pageId,
      tokenKind: "unknown",
      tokenSubjectId: null,
      tokenSubjectName: null,
      okForPublish: false,
      hint: e instanceof Error ? e.message : "Token diagnosis failed.",
    };
  }
}

/**
 * Publish a Page photo post (image + caption) via Meta Graph API.
 * Requires a Page access token with pages_manage_posts (not User / publish_actions).
 * `imageDataUrl` must be a PNG/JPEG data URL from the admin UI export.
 */
export async function publishFacebookPagePhoto(args: {
  message: string;
  imageDataUrl: string;
  link?: string | null;
}): Promise<FacebookPublishResult> {
  const cfg = getFacebookPagePublishConfig();
  if (!cfg) {
    return {
      ok: false,
      error:
        "Facebook publishing is not configured. Set FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN (Page token with pages_manage_posts).",
    };
  }

  const preflight = await assertFacebookPageToken(cfg);
  if (preflight) return preflight;

  const match = args.imageDataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i);
  if (!match) {
    return { ok: false, error: "Invalid image data URL (expected PNG/JPEG base64)." };
  }
  const mime = match[1]!.toLowerCase() === "image/jpg" ? "image/jpeg" : match[1]!;
  const buffer = Buffer.from(match[2]!, "base64");
  if (buffer.length < 100) {
    return { ok: false, error: "Image payload too small." };
  }
  if (buffer.length > 8 * 1024 * 1024) {
    return { ok: false, error: "Image must be under 8MB." };
  }

  const caption = [args.message.trim(), args.link?.trim()].filter(Boolean).join("\n\n");
  const form = new FormData();
  form.set("caption", caption.slice(0, 8000));
  form.set("published", "true");
  form.set("access_token", cfg.accessToken);
  form.set(
    "source",
    new Blob([new Uint8Array(buffer)], { type: mime }),
    mime.includes("png") ? "campaign.png" : "campaign.jpg",
  );

  const url = graphUrl(cfg, `${cfg.pageId}/photos`);

  try {
    const res = await fetch(url, { method: "POST", body: form });
    const json = (await res.json().catch(() => ({}))) as {
      id?: string;
      post_id?: string;
      error?: GraphErrorBody;
    };
    if (!res.ok || json.error) {
      return {
        ok: false,
        status: res.status,
        error: formatFacebookGraphError(json.error, res.status),
      };
    }
    return {
      ok: true,
      photoId: json.id,
      postId: json.post_id ?? json.id ?? "unknown",
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to reach Facebook Graph API.",
    };
  }
}

/** Text-only Page feed post (no image). */
export async function publishFacebookPageFeed(args: {
  message: string;
  link?: string | null;
}): Promise<FacebookPublishResult> {
  const cfg = getFacebookPagePublishConfig();
  if (!cfg) {
    return {
      ok: false,
      error:
        "Facebook publishing is not configured. Set FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN (Page token with pages_manage_posts).",
    };
  }

  const preflight = await assertFacebookPageToken(cfg);
  if (preflight) return preflight;

  const body: Record<string, string> = {
    message: args.message.trim().slice(0, 8000),
    access_token: cfg.accessToken,
  };
  if (args.link?.trim()) body.link = args.link.trim();

  const url = graphUrl(cfg, `${cfg.pageId}/feed`);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as {
      id?: string;
      error?: GraphErrorBody;
    };
    if (!res.ok || json.error) {
      return {
        ok: false,
        status: res.status,
        error: formatFacebookGraphError(json.error, res.status),
      };
    }
    return { ok: true, postId: json.id ?? "unknown" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to reach Facebook Graph API.",
    };
  }
}
