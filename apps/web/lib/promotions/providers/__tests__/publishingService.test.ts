import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/promotions/publishObservability", () => ({
  createPublishCorrelationId: () => "corr-test-001",
  fingerprintPublishPayload: () => "fp12",
  logPublishEvent: vi.fn(async () => undefined),
}));

vi.mock("@/lib/promotions/publishIdempotency", async () => {
  const actual = await vi.importActual<typeof import("@/lib/promotions/publishIdempotency")>(
    "@/lib/promotions/publishIdempotency",
  );
  return {
    ...actual,
    claimPublish: vi.fn(),
    markPublishSucceeded: vi.fn(async () => undefined),
    markPublishFailed: vi.fn(async () => undefined),
  };
});

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  claimPublish,
  markPublishFailed,
  markPublishSucceeded,
} from "@/lib/promotions/publishIdempotency";
import { createEmptyProviderRegistry } from "@/lib/promotions/providers/registry";
import { runPublish, publishOutcomeToHttp } from "@/lib/promotions/providers/publishingService";
import type { SocialProvider } from "@/lib/promotions/providers/types";

function makeFacebookLikeProvider(overrides?: Partial<SocialProvider>): SocialProvider {
  return {
    key: "facebook",
    version: "test",
    displayName: "Facebook Page",
    connect: async () => ({ ok: false, error: "n/a" }),
    disconnect: async () => ({ ok: false, error: "n/a" }),
    refreshAccessToken: async () => ({ ok: false, error: "n/a" }),
    validateConnection: async () => ({
      provider: "facebook",
      connected: true,
      configured: true,
      health: "healthy",
      statusLabel: "connected",
      targetRef: "page-1",
      displayName: "Test Page",
      hint: null,
    }),
    validateContent: (req) =>
      req.message.trim() ? { ok: true } : { ok: false, error: "message is required." },
    publish: async () => ({ ok: true, externalPostId: "post-99", postId: "post-99" }),
    getCapabilities: () => ({
      images: true,
      multipleImages: false,
      video: false,
      links: true,
      scheduling: false,
      locationPosts: false,
      characterLimit: 1000,
      richFormatting: false,
      requiresImage: false,
      publishEnabled: true,
    }),
    classifyError: ({ httpStatus, rawMessage }) => ({
      classification: httpStatus === 429 ? "rate_limit" : "unknown",
      retryable: httpStatus === 429,
      retryAfterMs: httpStatus === 429 ? 60_000 : null,
      userMessage: rawMessage,
      recoveryGuidance: "retry",
      httpStatus: httpStatus && httpStatus >= 400 ? httpStatus : 400,
    }),
    normalizeResponse: (raw) => raw as never,
    resolveTargetRef: async () => "page-1",
    ...overrides,
  };
}

describe("MKT-001C runPublish publishing service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from: vi.fn() } as never);
  });

  it("fails closed when admin/ledger client is unavailable", async () => {
    vi.mocked(getSupabaseAdmin).mockReturnValue(null);
    const registry = createEmptyProviderRegistry();
    registry.register(makeFacebookLikeProvider());

    const outcome = await runPublish({
      providerKey: "facebook",
      publishedBy: "admin@test.com",
      request: { message: "Hello" },
      registry,
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.httpStatus).toBe(503);
      expect(outcome.body.classification).toBe("provider_unavailable");
    }
    expect(claimPublish).not.toHaveBeenCalled();
  });

  it("rejects unsupported provider keys", async () => {
    const registry = createEmptyProviderRegistry();
    const outcome = await runPublish({
      providerKey: "instagram",
      publishedBy: "admin@test.com",
      request: { message: "Hello" },
      registry,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.httpStatus).toBe(400);
      expect(String(outcome.body.error)).toMatch(/Unsupported marketing provider/);
    }
  });

  it("claims then publishes and marks succeeded", async () => {
    vi.mocked(claimPublish).mockResolvedValue({
      outcome: "claimed",
      id: "claim-1",
      idempotencyKey: "key-1",
      attempts: 1,
    });
    const registry = createEmptyProviderRegistry();
    const publish = vi.fn(async () => ({
      ok: true as const,
      externalPostId: "post-99",
      postId: "post-99",
    }));
    registry.register(makeFacebookLikeProvider({ publish }));

    const outcome = await runPublish({
      providerKey: "facebook",
      publishedBy: "admin@test.com",
      request: { message: "Hello world" },
      registry,
    });

    expect(outcome.ok).toBe(true);
    expect(publish).toHaveBeenCalledOnce();
    expect(markPublishSucceeded).toHaveBeenCalledWith(
      expect.anything(),
      "claim-1",
      "post-99",
    );
    if (outcome.ok) {
      const http = publishOutcomeToHttp(outcome);
      expect(http.status).toBe(200);
      expect(http.body.correlationId).toBe("corr-test-001");
      expect(http.body.postId).toBe("post-99");
    }
  });

  it("returns idempotent replay without calling provider.publish", async () => {
    vi.mocked(claimPublish).mockResolvedValue({
      outcome: "duplicate_succeeded",
      externalPostId: "existing-post",
    });
    const publish = vi.fn();
    const registry = createEmptyProviderRegistry();
    registry.register(makeFacebookLikeProvider({ publish }));

    const outcome = await runPublish({
      providerKey: "facebook",
      publishedBy: "admin@test.com",
      request: { message: "Hello world" },
      registry,
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.idempotentReplay).toBe(true);
      expect(outcome.result.externalPostId).toBe("existing-post");
    }
    expect(publish).not.toHaveBeenCalled();
  });

  it("marks failed and returns classified error body", async () => {
    vi.mocked(claimPublish).mockResolvedValue({
      outcome: "claimed",
      id: "claim-2",
      idempotencyKey: "key-2",
      attempts: 1,
    });
    const registry = createEmptyProviderRegistry();
    registry.register(
      makeFacebookLikeProvider({
        publish: async () => ({ ok: false, error: "rate limited", status: 429 }),
      }),
    );

    const outcome = await runPublish({
      providerKey: "facebook",
      publishedBy: "admin@test.com",
      request: { message: "Hello world" },
      registry,
    });

    expect(markPublishFailed).toHaveBeenCalled();
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.httpStatus).toBe(429);
      expect(outcome.body.classification).toBe("rate_limit");
      expect(outcome.body.retryable).toBe(true);
    }
  });
});
