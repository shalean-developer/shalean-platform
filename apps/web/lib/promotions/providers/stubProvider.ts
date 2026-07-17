/**
 * MKT-001C — Stub providers for future platforms.
 *
 * Registered for discovery/capability queries; feature-flagged off by default
 * (same fail-closed policy as live adapters — enable only with MARKETING_PROVIDER_<KEY>=1).
 * Implementing a real adapter replaces the stub without changing the engine.
 */

import type {
  ConnectionResult,
  ConnectionStatus,
  ContentValidationResult,
  DisconnectResult,
  ProviderCapabilities,
  ProviderKey,
  ProviderRawError,
  PublishRequest,
  PublishResult,
  SocialProvider,
  TokenRefreshResult,
} from "@/lib/promotions/providers/types";
import { classifyPublishFailure } from "@/lib/promotions/publishProviderErrors";
import type { PublishProvider } from "@/lib/promotions/publishIdempotency";

const STUB_CAPS: ProviderCapabilities = {
  images: false,
  multipleImages: false,
  video: false,
  links: false,
  scheduling: false,
  locationPosts: false,
  characterLimit: null,
  richFormatting: false,
  requiresImage: false,
  publishEnabled: false,
};

function stubStatus(key: ProviderKey, displayName: string): ConnectionStatus {
  return {
    provider: key,
    connected: false,
    configured: false,
    health: "disconnected",
    statusLabel: "coming_soon",
    targetRef: null,
    displayName,
    hint: `${displayName} publishing is not enabled yet.`,
  };
}

/**
 * classifyPublishFailure only accepts ledger providers today; stubs map via facebook
 * taxonomy for structured recovery fields until a dedicated key exists.
 */
function stubClassify(raw: ProviderRawError) {
  return classifyPublishFailure({
    provider: "facebook" satisfies PublishProvider,
    httpStatus: raw.httpStatus ?? 501,
    rawMessage: raw.rawMessage,
    transportHint: raw.transportHint,
  });
}

export function createStubProvider(args: {
  key: Exclude<ProviderKey, "facebook" | "google_business" | "instagram">;
  displayName: string;
  version?: string;
}): SocialProvider {
  const { key, displayName, version = "0.0.0-stub" } = args;
  return {
    key,
    version,
    displayName,

    async connect(): Promise<ConnectionResult> {
      return {
        ok: false,
        error: `${displayName} is not available yet.`,
        status: stubStatus(key, displayName),
      };
    },

    async disconnect(): Promise<DisconnectResult> {
      return { ok: false, error: `${displayName} is not available yet.` };
    },

    async refreshAccessToken(): Promise<TokenRefreshResult> {
      return { ok: false, unsupported: true, error: `${displayName} is not available yet.` };
    },

    async validateConnection(): Promise<ConnectionStatus> {
      return stubStatus(key, displayName);
    },

    validateContent(_request: PublishRequest): ContentValidationResult {
      return { ok: false, error: `${displayName} publishing is not implemented.` };
    },

    async publish(_request: PublishRequest): Promise<PublishResult> {
      return {
        ok: false,
        error: `${displayName} publishing is not implemented.`,
        status: 501,
      };
    },

    getCapabilities: () => ({ ...STUB_CAPS }),

    classifyError: stubClassify,

    normalizeResponse(): PublishResult {
      return { ok: false, error: `${displayName} publishing is not implemented.`, status: 501 };
    },

    async resolveTargetRef(): Promise<string | null> {
      return null;
    },
  };
}
