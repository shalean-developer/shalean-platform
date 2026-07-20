/**
 * MKT-001C / MKT-001H — Facebook Page SocialProvider adapter.
 *
 * Publishing resolves tokens via Connected Accounts (encrypted) with optional
 * env fallback. OAuth connect/disconnect are handled by /api/oauth/facebook
 * and the social-accounts admin actions.
 */

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { recordPromotionEvent } from "@/lib/promotions/server";
import {
  diagnoseFacebookPagePublishConfig,
  publishFacebookPageFeed,
  publishFacebookPagePhoto,
  publishFacebookPagePhotoFromUrl,
} from "@/lib/promotions/facebookPublish";
import {
  disconnectFacebookConnection,
  getFacebookConnectionPublic,
  resolveFacebookPublishConfig,
} from "@/lib/promotions/facebookConnectedAccount";
import { isFacebookOAuthConfigured } from "@/lib/oauth/metaFacebookOAuth";
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

export const FACEBOOK_PROVIDER_VERSION = "1.1.0";

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
      const oauthConfigured = isFacebookOAuthConfigured();
      if (!oauthConfigured) {
        return {
          ok: false,
          error:
            "Facebook OAuth is not configured. Set FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, and FACEBOOK_REDIRECT_URI.",
          status: await provider.validateConnection(),
        };
      }
      return {
        ok: true,
        authorizationUrl: "/api/oauth/facebook",
        status: await provider.validateConnection(),
      };
    },

    async disconnect(): Promise<DisconnectResult> {
      const result = await disconnectFacebookConnection({ actor: "provider" });
      if (!result.ok) return { ok: false, error: result.error };
      return { ok: true };
    },

    async refreshAccessToken(): Promise<TokenRefreshResult> {
      return {
        ok: false,
        unsupported: true,
        error:
          "Facebook Page tokens are long-lived; use Reconnect Facebook when Meta returns an expired token.",
      };
    },

    async validateConnection(): Promise<ConnectionStatus> {
      const fb = await getFacebookConnectionPublic();
      const diagnosis = await diagnoseFacebookPagePublishConfig();

      let health: ConnectionStatus["health"] = "disconnected";
      let statusLabel = "disconnected";
      if (fb.account?.status === "pending_location") {
        health = "degraded";
        statusLabel = "pending_location";
      } else if (fb.account?.status === "error" || diagnosis.configured && !diagnosis.okForPublish) {
        health = "error";
        statusLabel = "error";
      } else if (diagnosis.okForPublish) {
        health = "healthy";
        statusLabel = "connected";
      } else if (fb.account?.status === "disconnected") {
        health = "disconnected";
        statusLabel = "disconnected";
      }

      return {
        provider: "facebook",
        connected: diagnosis.okForPublish || fb.account?.status === "pending_location",
        configured: diagnosis.configured || Boolean(fb.account && fb.account.status !== "disconnected"),
        health,
        statusLabel,
        targetRef: diagnosis.pageId ?? fb.account?.pageId ?? null,
        displayName: diagnosis.tokenSubjectName ?? fb.account?.accountName ?? null,
        hint: diagnosis.hint ?? fb.account?.lastError ?? null,
        details: {
          tokenKind: diagnosis.tokenKind,
          pageIdMasked: fb.account?.pageIdMasked ?? null,
          okForPublish: diagnosis.okForPublish,
          oauthConfigured: fb.oauthConfigured,
          tokenSource: diagnosis.source,
          envFallbackAllowed: fb.envFallbackAllowed,
          lastVerifiedAt: fb.account?.lastVerifiedAt ?? null,
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
        if (r.postId === "unknown" || !/^[\d_]+$/.test(r.postId.trim())) {
          return {
            ok: false,
            error: "Facebook publish returned an invalid post id.",
            status: 502,
          };
        }
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
      const resolved = await resolveFacebookPublishConfig();
      return resolved.ok ? resolved.config.pageId : null;
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
        await admin
          .from("social_accounts")
          .update({
            last_publish_at: new Date().toISOString(),
            last_sync: new Date().toISOString(),
            health: "healthy",
            updated_at: new Date().toISOString(),
          })
          .eq("provider", "facebook")
          .eq("status", "connected");
      } catch {
        // best-effort
      }
    },
  };
  return provider;
}
