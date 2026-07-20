/**
 * MKT-001G — Instagram SocialProvider adapter (Facebook Login path).
 */

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { recordPromotionEvent } from "@/lib/promotions/server";
import {
  INSTAGRAM_AUTH_MODEL,
  INSTAGRAM_CAPTION_LIMIT,
  disconnectInstagramConnection,
  discoverInstagramProfessionalAccount,
  publishInstagramSingleImage,
  resolveInstagramPublishConfig,
  saveInstagramConnection,
  validateInstagramImageUrl,
} from "@/lib/promotions/instagramPublish";
import { getFacebookPagePublishConfig } from "@/lib/promotions/facebookPublish";
import { resolveFacebookPublishConfig } from "@/lib/promotions/facebookConnectedAccount";
import { classifyPublishFailure } from "@/lib/promotions/publishProviderErrors";
import { isInstagramLoginConfigConfigured } from "@/lib/oauth/metaFacebookOAuth";
import type {
  ConnectionResult,
  ConnectionStatus,
  ContentValidationResult,
  DisconnectResult,
  ProviderCapabilities,
  ProviderRawError,
  PublishRequest,
  PublishResult,
  SocialProvider,
  TokenRefreshResult,
} from "@/lib/promotions/providers/types";

export const INSTAGRAM_PROVIDER_VERSION = "1.0.0";

function instagramCapabilities(): ProviderCapabilities {
  return {
    images: true,
    multipleImages: false,
    video: false,
    links: true,
    scheduling: false,
    locationPosts: false,
    characterLimit: INSTAGRAM_CAPTION_LIMIT,
    richFormatting: false,
    requiresImage: true,
    publishEnabled: true,
  };
}

export function createInstagramProvider(): SocialProvider {
  const provider: SocialProvider = {
    key: "instagram",
    version: INSTAGRAM_PROVIDER_VERSION,
    displayName: "Instagram",

    async connect(): Promise<ConnectionResult> {
      const fbResolved = await resolveFacebookPublishConfig();
      if (!fbResolved.ok && !getFacebookPagePublishConfig()) {
        return {
          ok: false,
          error:
            "Connect Facebook from Connected Accounts first (Facebook Login auth model for Instagram).",
        };
      }
      // Persist discovery using the Page token; caller supplies connectedBy via API wrapper.
      const saved = await saveInstagramConnection({ connectedBy: "system" });
      if (!saved.ok) {
        const status = await provider.validateConnection();
        return { ok: false, error: saved.error, status };
      }
      const status = await provider.validateConnection();
      return { ok: true, authorizationUrl: null, status };
    },

    async disconnect(): Promise<DisconnectResult> {
      return disconnectInstagramConnection();
    },

    async refreshAccessToken(): Promise<TokenRefreshResult> {
      return {
        ok: false,
        unsupported: true,
        error:
          "Instagram uses the Facebook Page token (Facebook Login). Reconnect Facebook from Connected Accounts, then reconnect Instagram.",
      };
    },

    async validateConnection(): Promise<ConnectionStatus> {
      const fbResolved = await resolveFacebookPublishConfig();
      const fbConfigured = fbResolved.ok || Boolean(getFacebookPagePublishConfig());

      // Connected requires a persisted Instagram social_accounts row — not ephemeral Graph rediscovery.
      const admin = getSupabaseAdmin();
      if (admin) {
        const { data: igRow } = await admin
          .from("social_accounts")
          .select("account_id, account_name, status, health, metadata, access_token")
          .eq("provider", "instagram")
          .maybeSingle();
        if (
          igRow?.account_id &&
          igRow.access_token &&
          String(igRow.access_token).startsWith("v") &&
          igRow.status === "connected"
        ) {
          const meta = (igRow.metadata ?? {}) as Record<string, unknown>;
          const username =
            typeof meta.username === "string"
              ? meta.username
              : igRow.account_name?.replace(/^@/, "") ?? null;
          const pageId =
            typeof meta.pageId === "string"
              ? meta.pageId
              : fbResolved.ok
                ? fbResolved.config.pageId
                : null;
          return {
            provider: "instagram",
            connected: true,
            configured: true,
            health: "healthy",
            statusLabel: "connected",
            targetRef: String(igRow.account_id),
            displayName: username ? `@${username}` : String(igRow.account_id),
            hint: null,
            details: {
              authModel: INSTAGRAM_AUTH_MODEL,
              pageIdMasked: pageId ? `${pageId.slice(0, 4)}…` : null,
              igUserIdMasked: `${String(igRow.account_id).slice(0, 4)}…`,
              okForPublish: true,
            },
          };
        }
      }

      const discovered = fbResolved.ok
        ? await discoverInstagramProfessionalAccount(
            fbResolved.config.accessToken,
            fbResolved.config.pageId,
          )
        : getFacebookPagePublishConfig()
          ? await discoverInstagramProfessionalAccount()
          : null;

      if (
        discovered &&
        !discovered.ok &&
        (discovered.code === "no_ig_linked" ||
          discovered.code === "ig_unavailable" ||
          discovered.code === "permission")
      ) {
        return {
          provider: "instagram",
          connected: false,
          configured: fbConfigured,
          health: discovered.code === "permission" ? "error" : "disconnected",
          statusLabel: discovered.code,
          targetRef: null,
          displayName: null,
          hint: discovered.error,
          details: {
            authModel: INSTAGRAM_AUTH_MODEL,
            okForPublish: false,
            discoveryCode: discovered.code,
          },
        };
      }

      if (discovered?.ok) {
        return {
          provider: "instagram",
          connected: false,
          configured: true,
          health: "degraded",
          statusLabel: "action_required",
          targetRef: discovered.igUserId,
          displayName: discovered.username ? `@${discovered.username}` : null,
          hint:
            "Instagram Professional account is discoverable on the connected Facebook Page. Click Connect Instagram to persist the connection.",
          details: {
            authModel: INSTAGRAM_AUTH_MODEL,
            okForPublish: false,
            pageIdMasked: `${discovered.pageId.slice(0, 4)}…`,
            igUserIdMasked: `${discovered.igUserId.slice(0, 4)}…`,
            discoveryReady: true,
          },
        };
      }

      return {
        provider: "instagram",
        connected: false,
        configured: fbConfigured,
        health: fbConfigured ? "error" : "disconnected",
        statusLabel: fbConfigured ? "error" : "disconnected",
        targetRef: null,
        displayName: null,
        hint: "Connect Instagram from Connected Accounts after Facebook Page is connected.",
        details: {
          authModel: INSTAGRAM_AUTH_MODEL,
          okForPublish: false,
          discoveryCode: discovered && !discovered.ok ? discovered.code : null,
        },
      };
    },

    validateContent(request: PublishRequest): ContentValidationResult {
      const message = request.message?.trim() ?? "";
      if (!message) {
        return { ok: false, error: "Caption is required." };
      }
      if (message.length > INSTAGRAM_CAPTION_LIMIT) {
        return {
          ok: false,
          error: `Caption exceeds Instagram limit (${INSTAGRAM_CAPTION_LIMIT}).`,
        };
      }
      if (request.imageDataUrl?.startsWith("data:") && !request.imageUrl?.trim()) {
        return {
          ok: false,
          error:
            "Instagram requires a public image URL. Save/select a campaign asset image before publishing (data URLs are rejected before queueing).",
        };
      }
      const image = validateInstagramImageUrl(request.imageUrl);
      if (!image.ok) {
        return { ok: false, error: image.error };
      }
      return { ok: true };
    },

    async publish(request: PublishRequest): Promise<PublishResult> {
      const raw = await publishInstagramSingleImage({
        message: request.message,
        imageUrl: request.imageUrl?.trim() ?? "",
        link: request.link,
      });
      return provider.normalizeResponse(raw);
    },

    getCapabilities: instagramCapabilities,

    classifyError(raw: ProviderRawError) {
      return classifyPublishFailure({
        provider: "instagram",
        httpStatus: raw.httpStatus,
        rawMessage: raw.rawMessage,
        transportHint: raw.transportHint,
      });
    },

    normalizeResponse(raw: unknown): PublishResult {
      const r = raw as {
        ok?: boolean;
        mediaId?: string;
        containerId?: string;
        permalink?: string | null;
        error?: string;
        status?: number;
      };
      if (r && r.ok === true && r.mediaId) {
        return {
          ok: true,
          externalPostId: r.mediaId,
          postId: r.mediaId,
          searchUrl: r.permalink ?? null,
          providerResponse: {
            containerId: r.containerId ?? null,
            permalink: r.permalink ?? null,
          },
        };
      }
      return {
        ok: false,
        error: (r && r.error) || "Instagram publish failed.",
        status: r?.status,
      };
    },

    async resolveTargetRef(): Promise<string | null> {
      const resolved = await resolveInstagramPublishConfig();
      return resolved.ok ? resolved.config.igUserId : null;
    },

    async afterPublishSuccess(ctx) {
      const admin = getSupabaseAdmin();
      if (!admin || !ctx.request.promotionId) return;
      try {
        await recordPromotionEvent(admin, {
          promotionId: ctx.request.promotionId,
          eventType: "click",
          metadata: {
            channel: "instagram",
            action: "published",
            mediaId: ctx.result.externalPostId,
            actor: ctx.publishedBy,
            correlationId: ctx.correlationId,
          },
        });
        await admin.from("promotion_audit_log").insert({
          promotion_id: ctx.request.promotionId,
          action: "publish_instagram",
          actor: ctx.publishedBy,
          after_state: {
            mediaId: ctx.result.externalPostId,
            permalink: ctx.result.searchUrl ?? null,
            correlationId: ctx.correlationId,
          },
        });
      } catch {
        // best-effort
      }
    },
  };
  return provider;
}

/**
 * Connect with an explicit admin actor (API route).
 *
 * Prefer Page-linked discovery via the existing Facebook Connected Account
 * (same architecture as Graph API Explorer on the Page token). Only fall back
 * to Instagram Login for Business OAuth when the Page token cannot discover IG
 * (missing Instagram permissions / no linkage readable).
 */
export async function connectInstagramForAdmin(connectedBy: string): Promise<ConnectionResult> {
  const provider = createInstagramProvider();

  const fbResolved = await resolveFacebookPublishConfig();
  if (fbResolved.ok) {
    const saved = await saveInstagramConnection({
      connectedBy,
      accessToken: fbResolved.config.accessToken,
      pageId: fbResolved.config.pageId,
    });
    const status = await provider.validateConnection();
    if (saved.ok) {
      return { ok: true, authorizationUrl: null, status };
    }

    // Page token present but Graph omitted IG fields or denied permissions →
    // upgrade scopes via Instagram Graph Login for Business when configured.
    if (
      (saved.code === "permission" || saved.code === "ig_unavailable") &&
      isInstagramLoginConfigConfigured()
    ) {
      return {
        ok: true,
        authorizationUrl: "/api/oauth/facebook?purpose=instagram",
        status,
      };
    }

    return { ok: false, error: saved.error, status };
  }

  if (isInstagramLoginConfigConfigured()) {
    return {
      ok: true,
      authorizationUrl: "/api/oauth/facebook?purpose=instagram",
      status: await provider.validateConnection(),
    };
  }

  if (!getFacebookPagePublishConfig()) {
    return {
      ok: false,
      error:
        "Connect Facebook from Connected Accounts first (Facebook Login auth model for Instagram).",
    };
  }

  const saved = await saveInstagramConnection({ connectedBy });
  const status = await provider.validateConnection();
  if (!saved.ok) {
    return { ok: false, error: saved.error, status };
  }
  return { ok: true, authorizationUrl: null, status };
}
