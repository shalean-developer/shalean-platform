import { describe, expect, it } from "vitest";
import {
  canInvokePublish,
  classifyProviderUxState,
  formatSafePercent,
  formatSafeRoi,
  getEmptyStateCopy,
  isCampaignFormDirty,
  isProviderPublishReady,
  providerUxStateLabel,
  registryAllowsPublish,
} from "@/lib/promotions/marketingUx";
import { formatPublishFailureToast } from "@/lib/promotions/publishFailureUi";

describe("MKT-001F provider state rendering", () => {
  it("classifies connected publish-ready providers", () => {
    expect(
      classifyProviderUxState({
        id: "facebook",
        available: true,
        connected: true,
        status: "connected",
        health: "healthy",
        publishEnabled: true,
        providerEnabled: true,
      }),
    ).toBe("connected");
    expect(
      isProviderPublishReady({
        id: "facebook",
        available: true,
        connected: true,
        status: "connected",
        publishEnabled: true,
      }),
    ).toBe(true);
  });

  it("keeps stub / disabled providers non-publishable", () => {
    expect(
      classifyProviderUxState({
        id: "instagram",
        available: false,
        connected: false,
        status: "coming_soon",
        publishEnabled: false,
      }),
    ).toBe("unsupported");
    expect(
      classifyProviderUxState({
        id: "linkedin",
        available: false,
        connected: false,
        status: "disabled",
        publishEnabled: false,
        providerEnabled: false,
      }),
    ).toBe("disabled");
    expect(
      isProviderPublishReady({
        id: "instagram",
        available: false,
        connected: false,
        status: "coming_soon",
        publishEnabled: false,
      }),
    ).toBe(false);
  });

  it("surfaces expired and degraded recovery states", () => {
    expect(
      classifyProviderUxState({
        id: "google_business",
        available: true,
        connected: true,
        status: "connected",
        health: "degraded",
        publishEnabled: true,
      }),
    ).toBe("degraded");
    expect(
      classifyProviderUxState({
        id: "google_business",
        available: true,
        connected: false,
        status: "error",
        health: "error",
        publishEnabled: true,
        lastError: "OAuth token expired — reconnect required",
      }),
    ).toBe("error");
    expect(
      classifyProviderUxState({
        id: "google_business",
        available: true,
        connected: false,
        status: "disconnected",
        publishEnabled: true,
        detail: "Refresh token expired",
      }),
    ).toBe("expired");
    expect(providerUxStateLabel("expired")).toMatch(/reconnect/i);
  });
});

describe("MKT-001F publish guards", () => {
  it("blocks duplicate publish while busy", () => {
    expect(
      canInvokePublish({
        busy: true,
        configured: true,
        overLimit: false,
        caption: "Hello",
      }),
    ).toBe(false);
  });

  it("blocks disabled / unconfigured / over-limit providers", () => {
    expect(
      canInvokePublish({
        busy: false,
        configured: false,
        overLimit: false,
        caption: "Hello",
      }),
    ).toBe(false);
    expect(
      canInvokePublish({
        busy: false,
        configured: true,
        registryPublishable: false,
        overLimit: false,
        caption: "Hello",
      }),
    ).toBe(false);
    expect(
      canInvokePublish({
        busy: false,
        configured: true,
        overLimit: true,
        caption: "Hello",
      }),
    ).toBe(false);
    expect(
      canInvokePublish({
        busy: false,
        configured: true,
        overLimit: false,
        caption: "  ",
      }),
    ).toBe(false);
  });

  it("allows a single publish when ready", () => {
    expect(
      canInvokePublish({
        busy: false,
        configured: true,
        registryPublishable: true,
        overLimit: false,
        caption: "Ready to post",
      }),
    ).toBe(true);
  });

  it("honors registry publishable flags", () => {
    expect(
      registryAllowsPublish(
        [{ key: "facebook", displayName: "Facebook", enabled: true, publishable: true }],
        "facebook",
      ),
    ).toBe(true);
    expect(
      registryAllowsPublish(
        [{ key: "instagram", displayName: "Instagram", enabled: false, publishable: false }],
        "instagram",
      ),
    ).toBe(false);
    expect(registryAllowsPublish(null, "facebook")).toBe(true);
  });
});

describe("MKT-001F empty / zero-data analytics", () => {
  it("returns actionable empty-state copy", () => {
    const empty = getEmptyStateCopy("no_connected_providers");
    expect(empty.title.toLowerCase()).not.toBe("no data");
    expect(empty.description.length).toBeGreaterThan(20);
    expect(empty.actionHref).toContain("/office/marketing");
  });

  it("avoids misleading percentages for zero samples", () => {
    expect(formatSafePercent(0, 0)).toBe("—");
    expect(formatSafePercent(null, 0)).toBe("—");
    expect(formatSafePercent(0.5, 10)).toBe("50%");
    expect(formatSafeRoi(0, 0)).toBe("—");
    expect(formatSafeRoi(1.25, 40)).toBe("125%");
  });
});

describe("MKT-001F unsaved-change + recovery helpers", () => {
  it("detects dirty campaign forms", () => {
    const baseline = { name: "Spring", discount_value: 10 };
    expect(isCampaignFormDirty({ name: "Spring", discount_value: 10 }, baseline)).toBe(false);
    expect(isCampaignFormDirty({ name: "Summer", discount_value: 10 }, baseline)).toBe(true);
  });

  it("keeps correlation id and recovery guidance in failure toasts", () => {
    const msg = formatPublishFailureToast({
      error: "Provider rate limited",
      recoveryGuidance: "Wait and retry from Social Posts.",
      retryable: true,
      retryAfterMs: 45_000,
      correlationId: "corr-mkt001f",
    });
    expect(msg).toContain("Provider rate limited");
    expect(msg).toContain("Wait and retry");
    expect(msg).toContain("corr-mkt001f");
  });
});
