/**
 * MKT-001C — Facebook Page SocialProvider adapter.
 *
 * Wraps existing facebookPublish.ts; does not change Graph API behavior,
 * encryption, SSRF, or idempotency (owned by the publishing service).
 */

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { recordPromotionEvent } from "@/lib/promotions/server";
import {
  diagnoseFacebookPagePublishConfig,
  getFacebookPagePublishConfig,
  publishFacebookPageFeed,
  publishFacebookPagePhoto,
  publishFacebookPagePhotoFromUrl,
} from "@/lib/promotions/facebookPublish";
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

export const FACEBOOK_PROVIDER_VERSION = "1.0.0";

function facebookCapabilities(): ProviderCapabilities {
  return {
    images: true,
    multipleImages: false,
    video: false,
    links: true,
    scheduling: false,
    locationPosts: false,
    characterLimit: 63_206,
    richFormatting: false,
    requiresImage: false,
    publishEnabled: true,
  };
}

export function createFacebookProvider(): SocialProvider {
  const provider: SocialProvider = {
    key: "facebook",
    version: FACEBOOK_PROVIDER_VERSION,
    displayName: "Facebook Page",

    async connect(): Promise<ConnectionResult> {
      const status = await provider.validateConnection();
      if (!status.configured) {
        return {
          ok: false,
          error:
            status.hint ??
            "Set FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN (env-based; no OAuth connect).",
          status,
        };
      }
      return { ok: true, authorizationUrl: null, status };
    },

    async disconnect(): Promise<DisconnectResult> {
      return {
        ok: false,
        error:
          "Facebook Page publishing uses environment tokens. Unset FACEBOOK_PAGE_ACCESS_TOKEN to disable.",
      };
    },

    async refreshAccessToken(): Promise<TokenRefreshResult> {
      return {
        ok: false,
        unsupported: true,
        error: "Facebook Page tokens are managed via environment variables; refresh is unsupported.",
      };
    },

    async validateConnection(): Promise<ConnectionStatus> {
      const diagnosis = await diagnoseFacebookPagePublishConfig();
      const cfg = getFacebookPagePublishConfig();
      return {
        provider: "facebook",
        connected: diagnosis.okForPublish,
        configured: diagnosis.configured,
        health: !diagnosis.configured
          ? "disconnected"
          : diagnosis.okForPublish
            ? "healthy"
            : "error",
        statusLabel: diagnosis.okForPublish
          ? "connected"
          : diagnosis.configured
            ? "misconfigured"
            : "disconnected",
        targetRef: cfg?.pageId ?? null,
        displayName: diagnosis.tokenSubjectName,
        hint: diagnosis.hint,
        details: {
          tokenKind: diagnosis.tokenKind,
          pageIdMasked: cfg ? `${cfg.pageId.slice(0, 4)}…` : null,
          okForPublish: diagnosis.okForPublish,
        },
      };
    },

    validateContent(request: PublishRequest): ContentValidationResult {
      const message = request.message?.trim() ?? "";
      if (!message) {
        return { ok: false, error: "message is required." };
      }
      const caps = facebookCapabilities();
      if (caps.characterLimit != null && message.length > caps.characterLimit) {
        return {
          ok: false,
          error: `Message exceeds Facebook character limit (${caps.characterLimit}).`,
        };
      }
      return { ok: true };
    },

    async publish(request: PublishRequest): Promise<PublishResult> {
      const message = request.message.trim();
      const raw =
        request.imageDataUrl?.startsWith("data:image/")
          ? await publishFacebookPagePhoto({
              message,
              imageDataUrl: request.imageDataUrl,
              link: request.link,
            })
          : request.imageUrl?.trim()
            ? await publishFacebookPagePhotoFromUrl({
                message,
                imageUrl: request.imageUrl.trim(),
                link: request.link,
              })
            : await publishFacebookPageFeed({ message, link: request.link });

      return provider.normalizeResponse(raw);
    },

    getCapabilities: facebookCapabilities,

    classifyError(raw: ProviderRawError) {
      return classifyPublishFailure({
        provider: "facebook",
        httpStatus: raw.httpStatus,
        rawMessage: raw.rawMessage,
        transportHint: raw.transportHint,
      });
    },

    normalizeResponse(raw: unknown): PublishResult {
      const r = raw as {
        ok?: boolean;
        postId?: string;
        photoId?: string;
        error?: string;
        status?: number;
      };
      if (r && r.ok === true && r.postId) {
        return {
          ok: true,
          externalPostId: r.postId,
          postId: r.postId,
          photoId: r.photoId ?? null,
        };
      }
      return {
        ok: false,
        error: (r && r.error) || "Facebook publish failed.",
        status: r?.status,
      };
    },

    async resolveTargetRef(): Promise<string | null> {
      return getFacebookPagePublishConfig()?.pageId ?? null;
    },

    async afterPublishSuccess(ctx) {
      const admin = getSupabaseAdmin();
      if (!admin || !ctx.request.promotionId) return;
      try {
        await recordPromotionEvent(admin, {
          promotionId: ctx.request.promotionId,
          eventType: "click",
          metadata: {
            channel: "facebook",
            action: "published",
            postId: ctx.result.externalPostId,
            actor: ctx.publishedBy,
            correlationId: ctx.correlationId,
          },
        });
        await admin.from("promotion_audit_log").insert({
          promotion_id: ctx.request.promotionId,
          action: "publish_facebook",
          actor: ctx.publishedBy,
          after_state: {
            postId: ctx.result.externalPostId,
            photoId: ctx.result.photoId ?? null,
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
