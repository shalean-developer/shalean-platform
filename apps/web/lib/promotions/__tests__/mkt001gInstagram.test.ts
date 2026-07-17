import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  formatInstagramGraphError,
  validateInstagramImageUrl,
  INSTAGRAM_CAPTION_LIMIT,
} from "@/lib/promotions/instagramPublish";
import { createInstagramProvider } from "@/lib/promotions/providers/instagramProvider";
import { classifyPublishFailure } from "@/lib/promotions/publishProviderErrors";

describe("MKT-001G Instagram publish helpers", () => {
  it("rejects missing and data-URL images before queueing", () => {
    expect(validateInstagramImageUrl(null).ok).toBe(false);
    expect(validateInstagramImageUrl("data:image/png;base64,abc").ok).toBe(false);
    expect(validateInstagramImageUrl("https://cdn.example.com/a.jpg")).toEqual({
      ok: true,
      url: "https://cdn.example.com/a.jpg",
    });
  });

  it("formats auth and permission Graph errors", () => {
    expect(formatInstagramGraphError({ code: 190, message: "expired" }, 401)).toMatch(/token/i);
    expect(
      formatInstagramGraphError({ code: 10, message: "permission" }, 403),
    ).toMatch(/instagram_content_publish/i);
  });

  it("classifies Instagram failures with provider-specific recovery", () => {
    const auth = classifyPublishFailure({
      provider: "instagram",
      httpStatus: 401,
      rawMessage: "token expired",
    });
    expect(auth.classification).toBe("auth");
    expect(auth.retryable).toBe(false);
    expect(auth.recoveryGuidance.toLowerCase()).toContain("instagram");

    const rate = classifyPublishFailure({
      provider: "instagram",
      httpStatus: 429,
      rawMessage: "rate limit",
    });
    expect(rate.retryable).toBe(true);
  });
});

describe("MKT-001G Instagram provider adapter", () => {
  const prevFlag = process.env.MARKETING_PROVIDER_INSTAGRAM;

  beforeEach(() => {
    process.env.MARKETING_PROVIDER_INSTAGRAM = "1";
  });

  afterEach(() => {
    if (prevFlag === undefined) delete process.env.MARKETING_PROVIDER_INSTAGRAM;
    else process.env.MARKETING_PROVIDER_INSTAGRAM = prevFlag;
  });

  it("requires caption and public image URL", () => {
    const ig = createInstagramProvider();
    expect(ig.validateContent({ message: "" }).ok).toBe(false);
    expect(ig.validateContent({ message: "hi" }).ok).toBe(false);
    expect(
      ig.validateContent({
        message: "hi",
        imageDataUrl: "data:image/png;base64,xxx",
      }).ok,
    ).toBe(false);
    expect(
      ig.validateContent({
        message: "hi",
        imageUrl: "https://cdn.example.com/feed.jpg",
      }).ok,
    ).toBe(true);
  });

  it("enforces caption length", () => {
    const ig = createInstagramProvider();
    const long = "x".repeat(INSTAGRAM_CAPTION_LIMIT + 1);
    expect(
      ig.validateContent({
        message: long,
        imageUrl: "https://cdn.example.com/feed.jpg",
      }).ok,
    ).toBe(false);
  });

  it("normalizes successful media publish responses", () => {
    const ig = createInstagramProvider();
    expect(
      ig.normalizeResponse({
        ok: true,
        mediaId: "1789",
        containerId: "c1",
        permalink: "https://instagram.com/p/x",
      }),
    ).toEqual({
      ok: true,
      externalPostId: "1789",
      postId: "1789",
      searchUrl: "https://instagram.com/p/x",
      providerResponse: { containerId: "c1", permalink: "https://instagram.com/p/x" },
    });
  });

  it("reports capabilities for single-image feed only", () => {
    const caps = createInstagramProvider().getCapabilities();
    expect(caps.images).toBe(true);
    expect(caps.requiresImage).toBe(true);
    expect(caps.multipleImages).toBe(false);
    expect(caps.video).toBe(false);
    expect(caps.characterLimit).toBe(2200);
  });
});

describe("MKT-001G Instagram migration contract", () => {
  it("widens ledger and jobs provider checks to include Instagram", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const root = join(process.cwd(), "..", "..");
    const sql = readFileSync(
      join(root, "supabase", "migrations", "20260717180000_mkt_001g_instagram_ledger_provider.sql"),
      "utf8",
    );
    expect(sql).toMatch(/instagram/);
    expect(sql).toMatch(/marketing_publish_idempotency/);
    expect(sql).toMatch(/social_publish_jobs/);
  });
});
