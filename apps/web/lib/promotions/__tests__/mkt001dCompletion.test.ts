import { describe, expect, it } from "vitest";
import {
  formatPublishFailureToast,
} from "@/lib/promotions/publishFailureUi";
import { validatePublishPayloadClient } from "@/lib/promotions/providerLimits";

describe("MKT-001D publishFailureUi", () => {
  it("includes recovery guidance and correlation id", () => {
    const msg = formatPublishFailureToast({
      error: "Rate limited",
      recoveryGuidance: "Wait about a minute, then retry.",
      retryable: true,
      retryAfterMs: 60_000,
      correlationId: "corr-abc",
    });
    expect(msg).toContain("Rate limited");
    expect(msg).toContain("Wait about a minute");
    expect(msg).toContain("Wait ~60s");
    expect(msg).toContain("Ref: corr-abc");
  });

  it("falls back when empty", () => {
    expect(formatPublishFailureToast({})).toBe("Publish failed.");
  });
});

describe("MKT-001D providerLimits", () => {
  it("rejects empty captions", () => {
    expect(
      validatePublishPayloadClient({ channel: "facebook", message: "  ", hasImage: false }),
    ).toMatchObject({ ok: false });
  });

  it("enforces Google Business image requirement", () => {
    expect(
      validatePublishPayloadClient({
        channel: "google_business",
        message: "Hello",
        hasImage: false,
      }),
    ).toMatchObject({ ok: false });
    expect(
      validatePublishPayloadClient({
        channel: "google_business",
        message: "Hello",
        hasImage: true,
      }),
    ).toMatchObject({ ok: true });
  });

  it("enforces character limits", () => {
    const long = "x".repeat(1501);
    expect(
      validatePublishPayloadClient({
        channel: "google_business",
        message: long,
        hasImage: true,
      }),
    ).toMatchObject({ ok: false });
  });

  it("blocks non-publish channels", () => {
    expect(
      validatePublishPayloadClient({
        channel: "linkedin",
        message: "Hello",
        hasImage: false,
      }),
    ).toMatchObject({ ok: false });
  });

  it("allows Instagram with branded public fallback image", () => {
    expect(
      validatePublishPayloadClient({
        channel: "instagram",
        message: "Hello",
        hasImage: true,
      }),
    ).toMatchObject({ ok: true });
  });

  it("allows X text-only publish", () => {
    expect(
      validatePublishPayloadClient({
        channel: "twitter",
        message: "Hello from Shalean",
        hasImage: false,
      }),
    ).toMatchObject({ ok: true });
  });
});
