/**
 * MKT-001C — Unified provider domain models.
 *
 * Core publishing depends on these types + SocialProvider only.
 * Provider-specific payloads stay encapsulated inside adapters.
 */

import type { ClassifiedPublishFailure } from "@/lib/promotions/publishProviderErrors";
import type { PublishProvider } from "@/lib/promotions/publishIdempotency";

/** All known marketing providers (publishable + future stubs). */
export type ProviderKey =
  | "facebook"
  | "google_business"
  | "instagram"
  | "linkedin"
  | "pinterest"
  | "x";

/** Providers that may claim the idempotency ledger today. */
export type LedgerProviderKey = PublishProvider;

export type PublishState =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "idempotent_replay"
  | "rejected";

export type ConnectionHealth = "healthy" | "degraded" | "error" | "unknown" | "disconnected";

export type ConnectionStatus = {
  provider: ProviderKey;
  connected: boolean;
  configured: boolean;
  health: ConnectionHealth;
  statusLabel: string;
  targetRef: string | null;
  displayName: string | null;
  hint: string | null;
  /** Provider-specific non-secret diagnostics (token kind, location, etc.). */
  details?: Record<string, unknown>;
};

export type ProviderCapabilities = {
  images: boolean;
  multipleImages: boolean;
  video: boolean;
  links: boolean;
  scheduling: boolean;
  locationPosts: boolean;
  /** Soft/hard character guidance; null when provider has no documented limit we enforce. */
  characterLimit: number | null;
  richFormatting: boolean;
  requiresImage: boolean;
  /** Env/feature flag — when false, registry will not serve publish. */
  publishEnabled: boolean;
};

export type PublishRequest = {
  message: string;
  imageDataUrl?: string | null;
  imageUrl?: string | null;
  link?: string | null;
  promotionId?: string | null;
  campaignName?: string | null;
  /** Opaque provider-specific extras (never required by the engine). */
  providerPayload?: Record<string, unknown>;
};

export type PublishResult =
  | {
      ok: true;
      externalPostId: string;
      /** Backward-compat aliases used by existing API clients. */
      postId?: string;
      postName?: string;
      photoId?: string | null;
      searchUrl?: string | null;
      providerResponse?: Record<string, unknown>;
    }
  | {
      ok: false;
      error: string;
      status?: number;
      providerResponse?: Record<string, unknown>;
    };

export type ContentValidationResult =
  | { ok: true }
  | { ok: false; error: string; classification?: ClassifiedPublishFailure };

export type ConnectionResult =
  | {
      ok: true;
      /** When OAuth is required, callers redirect here. */
      authorizationUrl?: string | null;
      status: ConnectionStatus;
    }
  | { ok: false; error: string; status?: ConnectionStatus };

export type DisconnectResult = { ok: true } | { ok: false; error: string };

export type TokenRefreshResult =
  | { ok: true; expiresAt?: string | null }
  | { ok: false; error: string; unsupported?: boolean };

export type ProviderRawError = {
  httpStatus?: number | null;
  rawMessage: string;
  transportHint?: "timeout" | "connection_reset" | "network" | null;
};

/**
 * Contract every marketing publish provider must implement.
 * Adding a provider = implement this + register + tests.
 */
export interface SocialProvider {
  readonly key: ProviderKey;
  readonly version: string;
  readonly displayName: string;

  connect(): Promise<ConnectionResult>;
  disconnect(): Promise<DisconnectResult>;
  refreshAccessToken(): Promise<TokenRefreshResult>;
  validateConnection(): Promise<ConnectionStatus>;

  validateContent(request: PublishRequest): ContentValidationResult;
  publish(request: PublishRequest): Promise<PublishResult>;

  getCapabilities(): ProviderCapabilities;
  classifyError(raw: ProviderRawError): ClassifiedPublishFailure;
  normalizeResponse(raw: unknown): PublishResult;

  /** Target used in the idempotency ledger (page id, location, etc.). */
  resolveTargetRef(): Promise<string | null>;

  /**
   * Optional side effects after a successful ledger mark
   * (promotion audit, campaign_content status, etc.).
   */
  afterPublishSuccess?(ctx: {
    request: PublishRequest;
    result: Extract<PublishResult, { ok: true }>;
    publishedBy: string;
    correlationId: string;
  }): Promise<void>;
}

export type ProviderRegistryEntry = {
  provider: SocialProvider;
  registeredAt: string;
  featureFlag: string;
  enabled: boolean;
};
