import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const decryptSecret = vi.fn((v: string) => `plain:${v}`);
const encryptSecret = vi.fn((v: string) => `enc:${v}`);

vi.mock("@/lib/security/tokenEncryption", () => ({
  decryptSecret: (v: string) => decryptSecret(v),
  encryptSecret: (v: string) => encryptSecret(v),
}));

const maybeSingle = vi.fn();
const fromMock = vi.fn(() => ({
  select: vi.fn(() => ({
    eq: vi.fn(() => ({
      maybeSingle,
    })),
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: fromMock }),
}));

import { resolveFacebookPublishConfig } from "@/lib/promotions/facebookConnectedAccount";

describe("MKT-001H resolveFacebookPublishConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.FACEBOOK_ALLOW_ENV_TOKEN_FALLBACK;
    delete process.env.FACEBOOK_PAGE_ID;
    delete process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    delete process.env.META_FACEBOOK_PAGE_ID;
    delete process.env.META_FACEBOOK_PAGE_ACCESS_TOKEN;
  });

  it("prefers encrypted connected account over env", async () => {
    process.env.FACEBOOK_ALLOW_ENV_TOKEN_FALLBACK = "1";
    process.env.FACEBOOK_PAGE_ID = "env-page";
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN = "env-token";

    maybeSingle.mockResolvedValue({
      data: {
        account_id: "page-db",
        access_token: "cipher-page",
        status: "connected",
        health: "healthy",
        metadata: {},
        account_name: "Shalean",
      },
    });

    const resolved = await resolveFacebookPublishConfig();
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.source).toBe("connected_account");
    expect(resolved.config.pageId).toBe("page-db");
    expect(resolved.config.accessToken).toBe("plain:cipher-page");
    expect(resolved.config.accessToken).not.toBe("env-token");
  });

  it("fails closed when disconnected and env fallback disabled", async () => {
    maybeSingle.mockResolvedValue({ data: null });
    const resolved = await resolveFacebookPublishConfig();
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.error.toLowerCase()).toContain("fallback");
  });

  it("uses env fallback only when explicitly allowed", async () => {
    maybeSingle.mockResolvedValue({ data: null });
    process.env.FACEBOOK_ALLOW_ENV_TOKEN_FALLBACK = "true";
    process.env.FACEBOOK_PAGE_ID = "env-page";
    process.env.FACEBOOK_PAGE_ACCESS_TOKEN = "env-token";

    const resolved = await resolveFacebookPublishConfig();
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.source).toBe("environment_fallback");
    expect(resolved.config.pageId).toBe("env-page");
  });

  it("blocks publish while Page selection is pending", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        account_id: null,
        access_token: "cipher-user",
        status: "pending_location",
        health: "healthy",
        metadata: { pages: [{ pageId: "1", pageName: "A", eligible: true }] },
        account_name: "Facebook Page",
      },
    });

    const resolved = await resolveFacebookPublishConfig();
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.error.toLowerCase()).toContain("not been selected");
  });
});
