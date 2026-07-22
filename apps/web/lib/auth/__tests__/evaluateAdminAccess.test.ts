import { beforeEach, describe, expect, it, vi } from "vitest";

const getSupabaseAdmin = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => getSupabaseAdmin(),
}));

describe("evaluateAdminAccess", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    getSupabaseAdmin.mockReset();
  });

  it("allows allowlisted emails without reading profile", async () => {
    vi.stubEnv("ADMIN_EMAILS", "info@shalean.com");
    vi.stubEnv("ADMIN_EMAIL", "");
    getSupabaseAdmin.mockReturnValue(null);
    const { evaluateAdminAccess } = await import("@/lib/auth/evaluateAdminAccess");
    const decision = await evaluateAdminAccess({
      userId: "u1",
      email: "info@shalean.com",
    });
    expect(decision).toEqual({ ok: true, via: "allowlist" });
  });

  it("allows profile role=admin when email is not allowlisted", async () => {
    vi.stubEnv("ADMIN_EMAILS", "info@shalean.com");
    vi.stubEnv("ADMIN_EMAIL", "");
    getSupabaseAdmin.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { role: "admin" }, error: null }),
          }),
        }),
      }),
    });
    const { evaluateAdminAccess } = await import("@/lib/auth/evaluateAdminAccess");
    const decision = await evaluateAdminAccess({
      userId: "farai-id",
      email: "farai@shalean.com",
    });
    expect(decision).toEqual({ ok: true, via: "profile_role" });
  });

  it("denies non-admin profile when not allowlisted", async () => {
    vi.stubEnv("ADMIN_EMAILS", "info@shalean.com");
    vi.stubEnv("ADMIN_EMAIL", "");
    getSupabaseAdmin.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { role: "customer" }, error: null }),
          }),
        }),
      }),
    });
    const { evaluateAdminAccess } = await import("@/lib/auth/evaluateAdminAccess");
    const decision = await evaluateAdminAccess({
      userId: "c1",
      email: "customer@example.com",
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.status).toBe(403);
  });

  it("allows profile role=admin even when ADMIN_EMAILS is empty", async () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    vi.stubEnv("ADMIN_EMAIL", "");
    getSupabaseAdmin.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { role: "admin" }, error: null }),
          }),
        }),
      }),
    });
    const { evaluateAdminAccess } = await import("@/lib/auth/evaluateAdminAccess");
    const decision = await evaluateAdminAccess({
      userId: "farai-id",
      email: "farai@shalean.com",
    });
    expect(decision).toEqual({ ok: true, via: "profile_role" });
  });
});
