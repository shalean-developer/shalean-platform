import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createEmptyProviderRegistry,
  isProviderFeatureEnabled,
  ProviderDisabledError,
  ProviderNotFoundError,
} from "@/lib/promotions/providers/registry";
import { createFacebookProvider } from "@/lib/promotions/providers/facebookProvider";
import { createGoogleBusinessProvider } from "@/lib/promotions/providers/googleBusinessProvider";
import { createStubProvider } from "@/lib/promotions/providers/stubProvider";
import type { SocialProvider } from "@/lib/promotions/providers/types";

describe("MKT-001C ProviderRegistry", () => {
  const prevFlags: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of [
      "MARKETING_PROVIDER_FACEBOOK",
      "MARKETING_PROVIDER_GOOGLE_BUSINESS",
      "MARKETING_PROVIDER_INSTAGRAM",
      "MARKETING_PROVIDER_LINKEDIN",
    ]) {
      prevFlags[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(prevFlags)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("registers and selects providers without engine conditionals", () => {
    process.env.MARKETING_PROVIDER_FACEBOOK = "1";
    process.env.MARKETING_PROVIDER_GOOGLE_BUSINESS = "1";
    const registry = createEmptyProviderRegistry();
    registry.register(createFacebookProvider());
    registry.register(createGoogleBusinessProvider());

    expect(registry.listKeys().sort()).toEqual(["facebook", "google_business"]);
    expect(registry.get("facebook").displayName).toBe("Facebook Page");
    expect(registry.requireEnabled("google_business").key).toBe("google_business");
  });

  it("rejects duplicate registration", () => {
    const registry = createEmptyProviderRegistry();
    registry.register(createFacebookProvider());
    expect(() => registry.register(createFacebookProvider())).toThrow(/already registered/);
  });

  it("throws on unsupported provider lookup", () => {
    const registry = createEmptyProviderRegistry();
    expect(() => registry.get("instagram")).toThrow(ProviderNotFoundError);
  });

  it("fail-closed: unset flags leave all providers disabled", () => {
    expect(isProviderFeatureEnabled("facebook")).toBe(false);
    expect(isProviderFeatureEnabled("google_business")).toBe(false);
    expect(isProviderFeatureEnabled("instagram")).toBe(false);

    const registry = createEmptyProviderRegistry();
    registry.register(createFacebookProvider());
    registry.register(createGoogleBusinessProvider());
    expect(() => registry.requireEnabled("facebook")).toThrow(ProviderDisabledError);
    expect(() => registry.requireEnabled("google_business")).toThrow(ProviderDisabledError);
  });

  it("respects feature flags for disabled providers", () => {
    process.env.MARKETING_PROVIDER_LINKEDIN = "0";
    const registry = createEmptyProviderRegistry();
    registry.register(createStubProvider({ key: "linkedin", displayName: "LinkedIn" }));
    expect(isProviderFeatureEnabled("linkedin")).toBe(false);
    expect(() => registry.requireEnabled("linkedin")).toThrow(ProviderDisabledError);
  });

  it("enables stubs when feature flag is on", () => {
    process.env.MARKETING_PROVIDER_LINKEDIN = "1";
    const registry = createEmptyProviderRegistry();
    registry.register(createStubProvider({ key: "linkedin", displayName: "LinkedIn" }));
    expect(registry.requireEnabled("linkedin").key).toBe("linkedin");
  });

  it("lists capabilities from registered providers", () => {
    process.env.MARKETING_PROVIDER_FACEBOOK = "1";
    process.env.MARKETING_PROVIDER_GOOGLE_BUSINESS = "1";
    const registry = createEmptyProviderRegistry();
    registry.register(createFacebookProvider());
    registry.register(createGoogleBusinessProvider());
    const caps = registry.listCapabilities();
    const fb = caps.find((c) => c.key === "facebook");
    const gbp = caps.find((c) => c.key === "google_business");
    expect(fb?.capabilities.images).toBe(true);
    expect(fb?.capabilities.requiresImage).toBe(false);
    expect(gbp?.capabilities.requiresImage).toBe(true);
    expect(gbp?.capabilities.locationPosts).toBe(true);
    expect(gbp?.capabilities.characterLimit).toBe(1500);
  });
});

describe("MKT-001C provider adapters", () => {
  it("Facebook normalizeResponse maps Graph success", () => {
    const fb = createFacebookProvider();
    expect(fb.normalizeResponse({ ok: true, postId: "123_456", photoId: "p1" })).toEqual({
      ok: true,
      externalPostId: "123_456",
      postId: "123_456",
      photoId: "p1",
    });
  });

  it("GBP normalizeResponse maps Local Post success", () => {
    const gbp = createGoogleBusinessProvider();
    const result = gbp.normalizeResponse({
      ok: true,
      postName: "accounts/1/locations/2/localPosts/3",
      searchUrl: "https://example.com",
      apiResponse: { name: "x" },
    });
    expect(result).toMatchObject({
      ok: true,
      externalPostId: "accounts/1/locations/2/localPosts/3",
      postName: "accounts/1/locations/2/localPosts/3",
      searchUrl: "https://example.com",
    });
  });

  it("classifies errors via shared taxonomy (backward compatible)", () => {
    const fb = createFacebookProvider();
    const failure = fb.classifyError({ httpStatus: 429, rawMessage: "slow down" });
    expect(failure.classification).toBe("rate_limit");
    expect(failure.retryable).toBe(true);
    expect(failure.recoveryGuidance.toLowerCase()).toContain("retry");
  });

  it("Facebook validateContent rejects empty message", () => {
    const fb = createFacebookProvider();
    expect(fb.validateContent({ message: "  " }).ok).toBe(false);
  });

  it("GBP validateContent requires an image", () => {
    const gbp = createGoogleBusinessProvider();
    expect(gbp.validateContent({ message: "Hello" }).ok).toBe(false);
    expect(
      gbp.validateContent({
        message: "Hello",
        imageUrl: "https://cdn.example.com/a.jpg",
      }).ok,
    ).toBe(true);
  });

  it("stub provider publish returns not implemented", async () => {
    const stub = createStubProvider({ key: "linkedin", displayName: "LinkedIn" });
    const result = await stub.publish({ message: "hi" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(501);
  });

  it("adding a provider only requires register + interface (engine untouched)", () => {
    const fake: SocialProvider = {
      key: "x",
      version: "test",
      displayName: "Fake X",
      connect: async () => ({ ok: false, error: "n/a" }),
      disconnect: async () => ({ ok: false, error: "n/a" }),
      refreshAccessToken: async () => ({ ok: false, error: "n/a" }),
      validateConnection: async () => ({
        provider: "x",
        connected: false,
        configured: false,
        health: "disconnected",
        statusLabel: "test",
        targetRef: null,
        displayName: null,
        hint: null,
      }),
      validateContent: () => ({ ok: true }),
      publish: async () => ({ ok: true, externalPostId: "x-1", postId: "x-1" }),
      getCapabilities: () => ({
        images: true,
        multipleImages: false,
        video: false,
        links: true,
        scheduling: false,
        locationPosts: false,
        characterLimit: 280,
        richFormatting: false,
        requiresImage: false,
        publishEnabled: true,
      }),
      classifyError: () => ({
        classification: "unknown",
        retryable: false,
        retryAfterMs: null,
        userMessage: "err",
        recoveryGuidance: "n/a",
        httpStatus: 400,
      }),
      normalizeResponse: () => ({ ok: false, error: "n/a" }),
      resolveTargetRef: async () => "x",
    };

    process.env.MARKETING_PROVIDER_X = "1";
    const registry = createEmptyProviderRegistry();
    registry.register(fake);
    expect(registry.requireEnabled("x").getCapabilities().characterLimit).toBe(280);
    delete process.env.MARKETING_PROVIDER_X;
  });
});
