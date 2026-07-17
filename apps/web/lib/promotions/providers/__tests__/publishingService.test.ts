import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/promotions/publishObservability", () => ({
  createPublishCorrelationId: () => "corr-test-001",
  fingerprintPublishPayload: () => "fp12",
  logPublishEvent: vi.fn(async () => undefined),
}));

vi.mock("@/lib/promotions/publishJobs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/promotions/publishJobs")>();
  return {
    ...actual,
    enqueuePublishJob: vi.fn(),
    leaseSpecificPublishJob: vi.fn(),
    executePublishJob: vi.fn(),
    newPublishJobHolderId: () => "holder-test",
  };
});

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  enqueuePublishJob,
  executePublishJob,
  leaseSpecificPublishJob,
} from "@/lib/promotions/publishJobs";
import { createEmptyProviderRegistry } from "@/lib/promotions/providers/registry";
import { runPublish, publishOutcomeToHttp } from "@/lib/promotions/providers/publishingService";
import type { SocialProvider } from "@/lib/promotions/providers/types";
import type { SocialPublishJobRow } from "@/lib/promotions/publishJobs";

function makeJob(overrides?: Partial<SocialPublishJobRow>): SocialPublishJobRow {
  return {
    id: "job-1",
    provider: "facebook",
    idempotency_key: "key-1",
    request_hash: "hash-1",
    target_ref: "page-1",
    promotion_id: null,
    campaign_name: null,
    payload: { message: "Hello world" },
    published_by: "admin@test.com",
    correlation_id: "corr-test-001",
    status: "queued",
    scheduled_for: new Date().toISOString(),
    next_attempt_at: null,
    attempts: 0,
    max_attempts: 5,
    last_error: null,
    failure_class: null,
    retryable: null,
    external_post_id: null,
    ledger_id: null,
    lease_holder: null,
    lease_expires_at: null,
    dead_lettered_at: null,
    replayed_from_job_id: null,
    cancelled_at: null,
    processed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

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
  const prevFacebookFlag = process.env.MARKETING_PROVIDER_FACEBOOK;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from: vi.fn() } as never);
    process.env.MARKETING_PROVIDER_FACEBOOK = "1";
  });

  afterEach(() => {
    if (prevFacebookFlag === undefined) delete process.env.MARKETING_PROVIDER_FACEBOOK;
    else process.env.MARKETING_PROVIDER_FACEBOOK = prevFacebookFlag;
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
    expect(enqueuePublishJob).not.toHaveBeenCalled();
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

  it("enqueues, leases, executes and returns success", async () => {
    const queued = makeJob({ status: "queued" });
    const leased = makeJob({ status: "leased", lease_holder: "holder-test", attempts: 1 });
    vi.mocked(enqueuePublishJob).mockResolvedValue({
      outcome: "enqueued",
      job: queued,
      created: true,
    });
    vi.mocked(leaseSpecificPublishJob).mockResolvedValue(leased);
    vi.mocked(executePublishJob).mockResolvedValue({
      job: { ...leased, status: "succeeded", external_post_id: "post-99" },
      serviceState: "succeeded",
      correlationId: "corr-test-001",
      httpStatus: 200,
      body: { ok: true },
      result: { ok: true, externalPostId: "post-99", postId: "post-99" },
      providerCalled: true,
    });

    const registry = createEmptyProviderRegistry();
    registry.register(makeFacebookLikeProvider());

    const outcome = await runPublish({
      providerKey: "facebook",
      publishedBy: "admin@test.com",
      request: { message: "Hello world" },
      registry,
    });

    expect(outcome.ok).toBe(true);
    expect(enqueuePublishJob).toHaveBeenCalledOnce();
    expect(leaseSpecificPublishJob).toHaveBeenCalledOnce();
    expect(executePublishJob).toHaveBeenCalledOnce();
    if (outcome.ok) {
      const http = publishOutcomeToHttp(outcome);
      expect(http.status).toBe(200);
      expect(http.body.correlationId).toBe("corr-test-001");
      expect(http.body.postId).toBe("post-99");
    }
  });

  it("returns idempotent replay when existing job already succeeded", async () => {
    const succeeded = makeJob({
      status: "succeeded",
      external_post_id: "existing-post",
      attempts: 1,
    });
    vi.mocked(enqueuePublishJob).mockResolvedValue({
      outcome: "existing_active",
      job: succeeded,
      created: false,
    });

    const registry = createEmptyProviderRegistry();
    const publish = vi.fn();
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
    expect(leaseSpecificPublishJob).not.toHaveBeenCalled();
    expect(executePublishJob).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it("returns classified failure body from executePublishJob", async () => {
    const queued = makeJob({ status: "queued" });
    const leased = makeJob({ status: "leased", lease_holder: "holder-test", attempts: 1 });
    vi.mocked(enqueuePublishJob).mockResolvedValue({
      outcome: "enqueued",
      job: queued,
      created: true,
    });
    vi.mocked(leaseSpecificPublishJob).mockResolvedValue(leased);
    vi.mocked(executePublishJob).mockResolvedValue({
      job: leased,
      serviceState: "failed",
      correlationId: "corr-test-001",
      httpStatus: 429,
      body: {
        error: "rate limited",
        classification: "rate_limit",
        retryable: true,
        correlationId: "corr-test-001",
      },
      providerCalled: true,
    });

    const registry = createEmptyProviderRegistry();
    registry.register(makeFacebookLikeProvider());

    const outcome = await runPublish({
      providerKey: "facebook",
      publishedBy: "admin@test.com",
      request: { message: "Hello world" },
      registry,
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.httpStatus).toBe(429);
      expect(outcome.body.classification).toBe("rate_limit");
      expect(outcome.body.retryable).toBe(true);
    }
  });
});
