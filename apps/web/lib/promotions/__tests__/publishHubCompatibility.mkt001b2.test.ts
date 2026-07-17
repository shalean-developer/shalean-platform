/**
 * MKT-001B.2 — Static Hub API compatibility contract for publish responses.
 * Guards that publishOutcomeToHttp success/failure shapes remain Hub-compatible.
 */
import { describe, expect, it } from "vitest";
import { publishOutcomeToHttp } from "@/lib/promotions/providers/publishingService";

describe("MKT-001B.2 Hub publish response compatibility", () => {
  it("preserves success body fields for Facebook-shaped outcomes", () => {
    const http = publishOutcomeToHttp({
      ok: true,
      state: "succeeded",
      correlationId: "corr-1",
      attempts: 1,
      result: {
        ok: true,
        externalPostId: "post_123",
        postId: "post_123",
        photoId: "photo_1",
      },
    });
    expect(http.status).toBe(200);
    expect(http.body).toMatchObject({
      ok: true,
      postId: "post_123",
      photoId: "photo_1",
      correlationId: "corr-1",
    });
  });

  it("preserves idempotent replay body", () => {
    const http = publishOutcomeToHttp({
      ok: true,
      state: "idempotent_replay",
      correlationId: "corr-2",
      idempotentReplay: true,
      result: {
        ok: true,
        externalPostId: "ext_9",
        postId: "ext_9",
        postName: "ext_9",
      },
    });
    expect(http.status).toBe(200);
    expect(http.body).toMatchObject({
      ok: true,
      postId: "ext_9",
      postName: "ext_9",
      idempotentReplay: true,
      correlationId: "corr-2",
    });
  });

  it("preserves failure classification fields including recoveryGuidance", () => {
    const http = publishOutcomeToHttp({
      ok: false,
      state: "failed",
      correlationId: "corr-3",
      httpStatus: 429,
      body: {
        error: "Rate limited",
        classification: "rate_limit",
        retryable: true,
        retryAfterMs: 60_000,
        recoveryGuidance: "Wait about a minute, then retry.",
        correlationId: "corr-3",
      },
    });
    expect(http.status).toBe(429);
    expect(http.body).toMatchObject({
      error: "Rate limited",
      classification: "rate_limit",
      retryable: true,
      retryAfterMs: 60_000,
      recoveryGuidance: "Wait about a minute, then retry.",
      correlationId: "corr-3",
    });
  });
});
