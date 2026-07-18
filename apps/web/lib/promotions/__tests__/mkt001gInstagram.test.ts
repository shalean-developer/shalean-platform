import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  formatInstagramGraphError,
  validateInstagramImageUrl,
  INSTAGRAM_CAPTION_LIMIT,
  INSTAGRAM_DISCOVERY_PERMISSION_MESSAGE,
  INSTAGRAM_DISCOVERY_UNAVAILABLE_MESSAGE,
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
    ).toMatch(/instagram_basic|instagram_content_publish|reconnect facebook/i);
  });

  it("exposes safer discovery-unavailable copy for missing IG field", () => {
    expect(INSTAGRAM_DISCOVERY_UNAVAILABLE_MESSAGE).toMatch(/could not be retrieved/i);
    expect(INSTAGRAM_DISCOVERY_UNAVAILABLE_MESSAGE).toMatch(/page token/i);
    expect(INSTAGRAM_DISCOVERY_UNAVAILABLE_MESSAGE).toMatch(/instagram permissions|connect instagram/i);
    expect(INSTAGRAM_DISCOVERY_UNAVAILABLE_MESSAGE).not.toMatch(
      /no instagram professional account is linked/i,
    );
    expect(INSTAGRAM_DISCOVERY_PERMISSION_MESSAGE).toMatch(/instagram_basic/i);
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

    const permission = classifyPublishFailure({
      provider: "instagram",
      httpStatus: 403,
      rawMessage: "permission",
    });
    expect(permission.classification).toBe("permission");
    expect(permission.recoveryGuidance.toLowerCase()).toMatch(/instagram_basic/);
    expect(permission.recoveryGuidance.toLowerCase()).toMatch(/reconnect facebook/);

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

describe("MKT-001H.1 Instagram discovery messaging", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns ig_unavailable with safer copy when Graph omits IG account", async () => {
    const { discoverInstagramProfessionalAccount } = await import(
      "@/lib/promotions/instagramPublish"
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          id: "page-1",
          name: "Shalean",
        }),
      ),
    );

    const result = await discoverInstagramProfessionalAccount("page-token", "page-1");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("ig_unavailable");
    expect(result.error).toBe(INSTAGRAM_DISCOVERY_UNAVAILABLE_MESSAGE);
  });

  it("classifies Graph permission failures separately from missing IG field", async () => {
    const { discoverInstagramProfessionalAccount } = await import(
      "@/lib/promotions/instagramPublish"
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            error: {
              message: "(#200) Requires extended permission: instagram_basic",
              code: 200,
              type: "OAuthException",
            },
          },
          { status: 403 },
        ),
      ),
    );

    const result = await discoverInstagramProfessionalAccount("page-token", "page-1");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("permission");
    expect(result.error.toLowerCase()).toMatch(/instagram_basic|reconnect facebook/);
    expect(result.error).not.toBe(INSTAGRAM_DISCOVERY_UNAVAILABLE_MESSAGE);
  });

  it("succeeds when instagram_business_account is present", async () => {
    const { discoverInstagramProfessionalAccount } = await import(
      "@/lib/promotions/instagramPublish"
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          id: "page-1",
          name: "Shalean",
          instagram_business_account: {
            id: "17841400000000000",
            username: "shalean",
            name: "Shalean",
          },
        }),
      ),
    );

    const result = await discoverInstagramProfessionalAccount("page-token", "page-1");
    expect(result).toEqual({
      ok: true,
      pageId: "page-1",
      igUserId: "17841400000000000",
      username: "shalean",
      name: "Shalean",
      accountTypeHint: "professional",
    });
  });

  it("falls back to connected_instagram_account when business field is omitted", async () => {
    const { discoverInstagramProfessionalAccount } = await import(
      "@/lib/promotions/instagramPublish"
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          id: "page-1",
          name: "Shalean",
          connected_instagram_account: {
            id: "17841400000000099",
            username: "shalean_connected",
            name: "Shalean Connected",
          },
        }),
      ),
    );

    const result = await discoverInstagramProfessionalAccount("page-token", "page-1");
    expect(result).toEqual({
      ok: true,
      pageId: "page-1",
      igUserId: "17841400000000099",
      username: "shalean_connected",
      name: "Shalean Connected",
      accountTypeHint: "professional",
    });
  });
});

describe("MKT-001I Instagram connect prefers Page-token discovery", () => {
  const prev = {
    MARKETING_PROVIDER_INSTAGRAM: process.env.MARKETING_PROVIDER_INSTAGRAM,
    INSTAGRAM_LOGIN_CONFIG_ID: process.env.INSTAGRAM_LOGIN_CONFIG_ID,
    META_INSTAGRAM_LOGIN_CONFIG_ID: process.env.META_INSTAGRAM_LOGIN_CONFIG_ID,
  };

  beforeEach(() => {
    process.env.MARKETING_PROVIDER_INSTAGRAM = "1";
    process.env.INSTAGRAM_LOGIN_CONFIG_ID = "1951379258911441";
    delete process.env.META_INSTAGRAM_LOGIN_CONFIG_ID;
    vi.resetModules();
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    vi.doUnmock("@/lib/promotions/facebookConnectedAccount");
    vi.doUnmock("@/lib/promotions/instagramPublish");
    vi.resetModules();
  });

  it("persists via Facebook Page token even when Instagram LfB config is set", async () => {
    vi.doMock("@/lib/promotions/facebookConnectedAccount", () => ({
      resolveFacebookPublishConfig: vi.fn(async () => ({
        ok: true,
        source: "connected_account",
        config: {
          pageId: "102815532315418",
          accessToken: "page-token",
          graphVersion: "v22.0",
        },
      })),
    }));
    vi.doMock("@/lib/promotions/instagramPublish", async () => {
      const actual = await vi.importActual<typeof import("@/lib/promotions/instagramPublish")>(
        "@/lib/promotions/instagramPublish",
      );
      return {
        ...actual,
        saveInstagramConnection: vi.fn(async (args: { pageId?: string; accessToken?: string }) => {
          expect(args.pageId).toBe("102815532315418");
          expect(args.accessToken).toBe("page-token");
          return {
            ok: true,
            igUserId: "17841451641117006",
            username: "shalean_cleaning_services",
            pageId: "102815532315418",
          };
        }),
        resolveInstagramPublishConfig: vi.fn(async () => ({
          ok: true,
          config: {
            pageId: "102815532315418",
            igUserId: "17841451641117006",
            accessToken: "page-token",
            graphVersion: "v22.0",
            username: "shalean_cleaning_services",
          },
        })),
        discoverInstagramProfessionalAccount: vi.fn(),
        disconnectInstagramConnection: vi.fn(),
        publishInstagramSingleImage: vi.fn(),
        validateInstagramImageUrl: actual.validateInstagramImageUrl,
        INSTAGRAM_AUTH_MODEL: actual.INSTAGRAM_AUTH_MODEL,
        INSTAGRAM_CAPTION_LIMIT: actual.INSTAGRAM_CAPTION_LIMIT,
      };
    });

    const { connectInstagramForAdmin: connect } = await import(
      "@/lib/promotions/providers/instagramProvider"
    );
    const result = await connect("farai@shalean.com");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.authorizationUrl).toBeNull();
  });

  it("falls back to Instagram LfB OAuth when Page-token discovery is unavailable", async () => {
    vi.doMock("@/lib/promotions/facebookConnectedAccount", () => ({
      resolveFacebookPublishConfig: vi.fn(async () => ({
        ok: true,
        source: "connected_account",
        config: {
          pageId: "102815532315418",
          accessToken: "page-token",
          graphVersion: "v22.0",
        },
      })),
    }));
    vi.doMock("@/lib/promotions/instagramPublish", async () => {
      const actual = await vi.importActual<typeof import("@/lib/promotions/instagramPublish")>(
        "@/lib/promotions/instagramPublish",
      );
      return {
        ...actual,
        saveInstagramConnection: vi.fn(async () => ({
          ok: false,
          code: "ig_unavailable",
          error: actual.INSTAGRAM_DISCOVERY_UNAVAILABLE_MESSAGE,
        })),
        resolveInstagramPublishConfig: vi.fn(async () => ({
          ok: false,
          error: actual.INSTAGRAM_DISCOVERY_UNAVAILABLE_MESSAGE,
        })),
        discoverInstagramProfessionalAccount: vi.fn(async () => ({
          ok: false,
          code: "ig_unavailable",
          error: actual.INSTAGRAM_DISCOVERY_UNAVAILABLE_MESSAGE,
        })),
        disconnectInstagramConnection: vi.fn(),
        publishInstagramSingleImage: vi.fn(),
        validateInstagramImageUrl: actual.validateInstagramImageUrl,
        INSTAGRAM_AUTH_MODEL: actual.INSTAGRAM_AUTH_MODEL,
        INSTAGRAM_CAPTION_LIMIT: actual.INSTAGRAM_CAPTION_LIMIT,
      };
    });

    const { connectInstagramForAdmin: connect } = await import(
      "@/lib/promotions/providers/instagramProvider"
    );
    const result = await connect("farai@shalean.com");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.authorizationUrl).toBe("/api/oauth/facebook?purpose=instagram");
  });
});
