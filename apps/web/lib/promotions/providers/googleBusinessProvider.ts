/**
 * MKT-001C — Google Business Profile SocialProvider adapter.
 *
 * Wraps google-business.ts. Token encryption, SSRF-safe media, and OAuth
 * remain in the existing modules — this adapter does not reimplement them.
 */

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { recordPromotionEvent } from "@/lib/promotions/server";
import {
  createGoogleBusinessLocalPost,
  disconnectGoogleBusiness,
  ensurePublicImageUrlForGooglePost,
  getGoogleBusinessConnectionPublic,
  getValidGoogleBusinessAccessToken,
} from "@/lib/google-business";
import { getGoogleOAuthConfig } from "@/lib/oauth/googleBusinessOAuth";
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

export const GOOGLE_BUSINESS_PROVIDER_VERSION = "1.0.0";

function gbpCapabilities(): ProviderCapabilities {
  return {
    images: true,
    multipleImages: false,
    video: false,
    links: true,
    scheduling: false,
    locationPosts: true,
    characterLimit: 1500,
    richFormatting: false,
    requiresImage: true,
    publishEnabled: true,
  };
}

export function createGoogleBusinessProvider(): SocialProvider {
  const provider: SocialProvider = {
    key: "google_business",
    version: GOOGLE_BUSINESS_PROVIDER_VERSION,
    displayName: "Google Business Profile",

    async connect(): Promise<ConnectionResult> {
      const status = await provider.validateConnection();
      const oauth = getGoogleOAuthConfig();
      if (!oauth) {
        return {
          ok: false,
          error: "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.",
          status,
        };
      }
      if (status.connected && status.statusLabel === "connected") {
        return { ok: true, authorizationUrl: null, status };
      }
      return {
        ok: true,
        authorizationUrl: "/api/oauth/google",
        status,
      };
    },

    async disconnect(): Promise<DisconnectResult> {
      return disconnectGoogleBusiness();
    },

    async refreshAccessToken(): Promise<TokenRefreshResult> {
      const tokenRes = await getValidGoogleBusinessAccessToken();
      if (!tokenRes.ok) {
        return { ok: false, error: tokenRes.error };
      }
      return {
        ok: true,
        expiresAt: tokenRes.account.expires_at ?? null,
      };
    },

    async validateConnection(): Promise<ConnectionStatus> {
      const gbp = await getGoogleBusinessConnectionPublic();
      const account = gbp.account as {
        accountName?: string | null;
        locationName?: string | null;
        status?: string | null;
        health?: string | null;
      } | null;

      const statusLabel = account?.status ?? "disconnected";
      const healthRaw = account?.health ?? "unknown";
      const health =
        healthRaw === "healthy" ||
        healthRaw === "degraded" ||
        healthRaw === "error" ||
        healthRaw === "unknown" ||
        healthRaw === "disconnected"
          ? healthRaw
          : "unknown";

      let hint: string | null = null;
      if (!gbp.oauthConfigured) {
        hint = "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.";
      } else if (!gbp.connected) {
        hint = "Connect Google Business Profile from Connected Accounts.";
      } else if (statusLabel !== "connected") {
        hint = "Select a Business location before publishing.";
      }

      return {
        provider: "google_business",
        connected: gbp.connected,
        configured: gbp.configured,
        health: !gbp.connected ? "disconnected" : health,
        statusLabel,
        targetRef: "google_business",
        displayName: account?.locationName ?? account?.accountName ?? null,
        hint,
        details: {
          oauthConfigured: gbp.oauthConfigured,
          accountName: account?.accountName ?? null,
          locationName: account?.locationName ?? null,
        },
      };
    },

    validateContent(request: PublishRequest): ContentValidationResult {
      const message = request.message?.trim() ?? "";
      if (!message) {
        return { ok: false, error: "message is required." };
      }
      const caps = gbpCapabilities();
      if (caps.characterLimit != null && message.length > caps.characterLimit) {
        return {
          ok: false,
          error: `Message exceeds Google Business character limit (${caps.characterLimit}).`,
        };
      }
      const hasImage =
        Boolean(request.imageUrl?.trim()) ||
        Boolean(request.imageDataUrl?.startsWith("data:image/"));
      if (caps.requiresImage && !hasImage) {
        return {
          ok: false,
          error: "An image is required to publish to Google Business.",
        };
      }
      return { ok: true };
    },

    async publish(request: PublishRequest): Promise<PublishResult> {
      // Media prep runs inside the provider so the engine stays agnostic.
      // Caller (publishing service) must have already claimed idempotency.
      const media = await ensurePublicImageUrlForGooglePost({
        imageUrl: request.imageUrl,
        imageDataUrl: request.imageDataUrl,
        promotionId: request.promotionId,
      });
      if (!media.ok) {
        return { ok: false, error: media.error, status: 400 };
      }

      const raw = await createGoogleBusinessLocalPost({
        summary: request.message.trim(),
        imageUrl: media.imageUrl,
        callToActionUrl: request.link,
      });
      return provider.normalizeResponse(raw);
    },

    getCapabilities: gbpCapabilities,

    classifyError(raw: ProviderRawError) {
      return classifyPublishFailure({
        provider: "google_business",
        httpStatus: raw.httpStatus,
        rawMessage: raw.rawMessage,
        transportHint: raw.transportHint,
      });
    },

    normalizeResponse(raw: unknown): PublishResult {
      const r = raw as {
        ok?: boolean;
        postName?: string;
        searchUrl?: string | null;
        error?: string;
        status?: number;
        apiResponse?: Record<string, unknown>;
      };
      if (r && r.ok === true && r.postName) {
        return {
          ok: true,
          externalPostId: r.postName,
          postName: r.postName,
          searchUrl: r.searchUrl ?? null,
          providerResponse: r.apiResponse,
        };
      }
      return {
        ok: false,
        error: (r && r.error) || "Google Business publish failed.",
        status: r?.status,
        providerResponse: r?.apiResponse,
      };
    },

    async resolveTargetRef(): Promise<string | null> {
      return "google_business";
    },

    async afterPublishSuccess(ctx) {
      const admin = getSupabaseAdmin();
      if (!admin || !ctx.request.promotionId) return;
      try {
        await recordPromotionEvent(admin, {
          promotionId: ctx.request.promotionId,
          eventType: "click",
          metadata: {
            channel: "google_business",
            action: "published",
            postId: ctx.result.externalPostId,
            actor: ctx.publishedBy,
            correlationId: ctx.correlationId,
          },
        });
        await admin.from("promotion_audit_log").insert({
          promotion_id: ctx.request.promotionId,
          action: "publish_google_business",
          actor: ctx.publishedBy,
          after_state: {
            postName: ctx.result.externalPostId,
            searchUrl: ctx.result.searchUrl ?? null,
            correlationId: ctx.correlationId,
          },
        });
        await admin
          .from("campaign_content")
          .update({ status: "published", updated_at: new Date().toISOString() })
          .eq("promotion_id", ctx.request.promotionId)
          .eq("channel", "google_business");
      } catch {
        // best-effort
      }
    },
  };
  return provider;
}
