import { describe, expect, it } from "vitest";
import {
  PROVIDER_PUBLISH_LIMITS,
  resolveInstagramPublishImageUrl,
  SHALEAN_BRANDED_INSTAGRAM_IMAGE_URL,
} from "@/lib/promotions/providerLimits";
import { registryAllowsPublish } from "@/lib/promotions/marketingUx";

describe("MKT-001K.1 publishing closure", () => {
  it("maps registry key x for X publish routing", () => {
    const providers = [
      {
        key: "x",
        displayName: "X",
        enabled: true,
        publishable: true,
        capabilities: { publishEnabled: true, characterLimit: 280 },
      },
      {
        key: "facebook",
        displayName: "Facebook Page",
        enabled: true,
        publishable: true,
        capabilities: { publishEnabled: true },
      },
    ];
    expect(registryAllowsPublish(providers, "x")).toBe(true);
    expect(registryAllowsPublish(providers, "twitter")).toBe(false);
  });

  it("exposes X character limit for Social Posts UI", () => {
    expect(PROVIDER_PUBLISH_LIMITS.twitter.characterLimit).toBe(280);
  });

  it("resolves Instagram public image from asset or branded fallback", () => {
    expect(resolveInstagramPublishImageUrl(null)).toBe(SHALEAN_BRANDED_INSTAGRAM_IMAGE_URL);
    expect(resolveInstagramPublishImageUrl("https://cdn.example.com/feed.jpg")).toBe(
      "https://cdn.example.com/feed.jpg",
    );
    expect(SHALEAN_BRANDED_INSTAGRAM_IMAGE_URL).toMatch(/^https:\/\/shalean\.co\.za\//);
  });
});
