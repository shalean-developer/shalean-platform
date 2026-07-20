/**
 * MKT-001I — X (Twitter) SocialProvider adapter (OAuth 2.0 PKCE).
 */

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { recordPromotionEvent } from "@/lib/promotions/server";
import {
  X_TWEET_CHAR_LIMIT,
  disconnectXConnection,
  getXConnectionPublic,
  publishXTextTweet,
  resolveXPublishConfig,
} from "@/lib/promotions/xPublish";
import { isXOAuthConfigured } from "@/lib/oauth/xOAuth";
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

export const X_PROVIDER_VERSION = "1.0.0";

function xCapabilities(): ProviderCapabilities {
  return {
    images: false,
    multipleImages: false,
    video: false,
    links: true,
    scheduling: false,
    locationPosts: false,
    characterLimit: X_TWEET_CHAR_LIMIT,
    richFormatting: false,
    requiresImage: false,
    publishEnabled: true,
  };
}

export function createXProvider(): SocialProvider {
  const provider: SocialProvider = {
    key: "x",
    version: X_PROVIDER_VERSION,
    displayName: "X",

    async connect(): Promise<ConnectionResult> {
      if (!isXOAuthConfigured()) {
        return {
          ok: false,
          error: "X OAuth is not configured. Set X_CLIENT_ID, X_CLIENT_SECRET, and X_REDIRECT_URI.",
          status: await provider.validateConnection(),
        };
      }
      return {
        ok: true,
        authorizationUrl: "/api/oauth/x",
        status: await provider.validateConnection(),
      };
    },

    async disconnect(): Promise<DisconnectResult> {
      return disconnectXConnection({ actor: "provider" });
    },

    async refreshAccessToken(): Promise<TokenRefreshResult> {
      const resolved = await resolveXPublishConfig();
      if (!resolved.ok) {
        return { ok: false, error: resolved.error };
      }
      return { ok: true };
    },

    async validateConnection(): Promise<ConnectionStatus> {
      const pub = await getXConnectionPublic();
      const oauthConfigured = isXOAuthConfigured();

      if (!oauthConfigured && !pub.connected) {
        return {
          provider: "x",
          connected: false,
          configured: false,
          health: "disconnected",
          statusLabel: "disconnected",
          targetRef: null,
          displayName: null,
          hint: "Set X_CLIENT_ID, X_CLIENT_SECRET, and X_REDIRECT_URI.",
          details: { okForPublish: false, oauthConfigured: false },
        };
      }

      if (!pub.connected) {
        return {
          provider: "x",
          connected: false,
          configured: oauthConfigured,
          health: "disconnected",
          statusLabel: "disconnected",
          targetRef: null,
          displayName: null,
          hint: pub.lastError || "Connect X from Connected Accounts.",
          details: { okForPublish: false, oauthConfigured },
        };
      }

      const expiresSoon =
        pub.expiresAt != null && Date.parse(pub.expiresAt) - Date.now() < 5 * 60 * 1000;

      return {
        provider: "x",
        connected: true,
        configured: true,
        health: expiresSoon ? "degraded" : "healthy",
        statusLabel: expiresSoon ? "action_required" : "connected",
        targetRef: pub.userIdMasked,
        displayName: pub.accountName,
        hint: expiresSoon
          ? "Access token is near expiry; publishing will refresh automatically when a refresh token is present."
          : null,
        details: {
          okForPublish: true,
          oauthConfigured: true,
          username: pub.username,
          userIdMasked: pub.userIdMasked,
          authModel: "oauth2_pkce",
        },
      };
    },

    validateContent(request: PublishRequest): ContentValidationResult {
      const text = request.message?.trim() ?? "";
      if (!text) {
        return { ok: false, error: "Tweet text is required." };
      }
      if (text.length > X_TWEET_CHAR_LIMIT) {
        return {
          ok: false,
          error: `Tweet exceeds ${X_TWEET_CHAR_LIMIT} characters.`,
          classification: classifyPublishFailure({
            provider: "x",
            httpStatus: 400,
            rawMessage: "character limit",
          }),
        };
      }
      return { ok: true };
    },

    async publish(request: PublishRequest): Promise<PublishResult> {
      const validation = provider.validateContent(request);
      if (!validation.ok) {
        return { ok: false, error: validation.error, status: 400 };
      }

      const result = await publishXTextTweet({ text: request.message });
      return provider.normalizeResponse(result);
    },

    getCapabilities: () => xCapabilities(),

    classifyError(raw: ProviderRawError) {
      return classifyPublishFailure({
        provider: "x",
        httpStatus: raw.httpStatus ?? 500,
        rawMessage: raw.rawMessage,
        transportHint: raw.transportHint,
      });
    },

    normalizeResponse(raw: unknown): PublishResult {
      const r = raw as {
        ok?: boolean;
        tweetId?: string;
        error?: string;
        status?: number;
        retryable?: boolean;
      };
      if (r && r.ok === true && r.tweetId) {
        return {
          ok: true,
          externalPostId: r.tweetId,
          postId: r.tweetId,
          providerResponse: { tweetId: r.tweetId },
        };
      }
      return {
        ok: false,
        error: (r && r.error) || "X publish failed.",
        status: r?.status,
        providerResponse: { retryable: r?.retryable ?? false },
      };
    },

    async resolveTargetRef(): Promise<string | null> {
      const resolved = await resolveXPublishConfig();
      return resolved.ok ? resolved.config.userId : null;
    },

    async afterPublishSuccess(ctx) {
      const admin = getSupabaseAdmin();
      if (!admin || !ctx.request.promotionId) return;
      try {
        await recordPromotionEvent(admin, {
          promotionId: ctx.request.promotionId,
          eventType: "click",
          metadata: {
            channel: "twitter",
            action: "published",
            tweetId: ctx.result.externalPostId,
            actor: ctx.publishedBy,
            correlationId: ctx.correlationId,
          },
        });
        await admin.from("promotion_audit_log").insert({
          promotion_id: ctx.request.promotionId,
          action: "publish_x",
          actor: ctx.publishedBy,
          after_state: {
            tweetId: ctx.result.externalPostId,
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
