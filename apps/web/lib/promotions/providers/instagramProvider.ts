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
      const fb = getFacebookPagePublishConfig();
      const resolved = await resolveInstagramPublishConfig();
      if (resolved.ok) {
        return {
          provider: "instagram",
          connected: true,
          configured: true,
          health: "healthy",
          statusLabel: "connected",
          targetRef: resolved.config.igUserId,
          displayName: resolved.config.username
            ? `@${resolved.config.username}`
            : resolved.config.igUserId,
          hint: null,
          details: {
            authModel: INSTAGRAM_AUTH_MODEL,
            pageIdMasked: resolved.config.pageId
              ? `${resolved.config.pageId.slice(0, 4)}…`
              : null,
            igUserIdMasked: `${resolved.config.igUserId.slice(0, 4)}…`,
            okForPublish: true,
          },
        };
      }

      const discovered = fb
        ? await discoverInstagramProfessionalAccount(fb.accessToken, fb.pageId)
        : null;

      if (discovered && !discovered.ok && discovered.code === "no_ig_linked") {
        return {
          provider: "instagram",
          connected: false,
          configured: Boolean(fb),
          health: "disconnected",
          statusLabel: "no_ig_linked",
          targetRef: null,
          displayName: null,
          hint: discovered.error,
          details: { authModel: INSTAGRAM_AUTH_MODEL, okForPublish: false },
        };
      }

      return {
        provider: "instagram",
        connected: false,
        configured: Boolean(fb),
        health: fb ? "error" : "disconnected",
        statusLabel: fb ? "error" : "disconnected",
        targetRef: null,
        displayName: null,
        hint:
          resolved.ok === false
            ? resolved.error
            : "Connect Instagram from Connected Accounts after configuring the Facebook Page token.",
        details: {
          authModel: INSTAGRAM_AUTH_MODEL,
          okForPublish: false,
          discoveryCode:
            discovered && !discovered.ok ? discovered.code : null,
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

/** Connect with an explicit admin actor (API route). */
export async function connectInstagramForAdmin(connectedBy: string): Promise<ConnectionResult> {
  const provider = createInstagramProvider();
  const fb = getFacebookPagePublishConfig();
  if (!fb) {
    return {
      ok: false,
      error:
        "Configure FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN first (Facebook Login auth model).",
    };
  }
  const saved = await saveInstagramConnection({ connectedBy });
  const status = await provider.validateConnection();
  if (!saved.ok) {
    return { ok: false, error: saved.error, status };
  }
  return { ok: true, authorizationUrl: null, status };
}
