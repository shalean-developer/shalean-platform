import { beforeEach, describe, expect, it, vi } from "vitest";

const getSupabaseAdmin = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => getSupabaseAdmin(),
}));

function adminMock(params: { assignments?: Array<{ id: string }>; profileRole?: string | null }) {
  return {
    from: (table: string) => {
      if (table === "admin_user_roles") {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                lte: () => ({
                  or: () => ({
                    limit: async () => ({ data: params.assignments ?? [], error: null }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "user_profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { role: params.profileRole ?? null }, error: null }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };
}

describe("evaluateAdminAccess", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    getSupabaseAdmin.mockReset();
  });

  it("allows allowlisted emails without reading database access", async () => {
    vi.stubEnv("ADMIN_EMAILS", "info@shalean.com");
    vi.stubEnv("ADMIN_EMAIL", "");
    getSupabaseAdmin.mockReturnValue(null);
    const { evaluateAdminAccess } = await import("@/lib/auth/evaluateAdminAccess");
    const decision = await evaluateAdminAccess({ userId: "u1", email: "info@shalean.com" });
    expect(decision).toEqual({ ok: true, via: "allowlist" });
  });

  it("allows an active granular RBAC assignment before the legacy profile role", async () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    vi.stubEnv("ADMIN_EMAIL", "");
    getSupabaseAdmin.mockReturnValue(adminMock({ assignments: [{ id: "assignment-1" }], profileRole: "customer" }));
    const { evaluateAdminAccess } = await import("@/lib/auth/evaluateAdminAccess");
    const decision = await evaluateAdminAccess({ userId: "rbac-user", email: "rbac-supervisor@shalean.test" });
    expect(decision).toEqual({ ok: true, via: "rbac_assignment" });
  });

  it("allows profile role=admin when no active RBAC assignment exists", async () => {
    vi.stubEnv("ADMIN_EMAILS", "info@shalean.com");
    vi.stubEnv("ADMIN_EMAIL", "");
    getSupabaseAdmin.mockReturnValue(adminMock({ profileRole: "admin" }));
    const { evaluateAdminAccess } = await import("@/lib/auth/evaluateAdminAccess");
    const decision = await evaluateAdminAccess({ userId: "farai-id", email: "farai@shalean.com" });
    expect(decision).toEqual({ ok: true, via: "profile_role" });
  });

  it("denies a non-admin profile with no active RBAC assignment", async () => {
    vi.stubEnv("ADMIN_EMAILS", "info@shalean.com");
    vi.stubEnv("ADMIN_EMAIL", "");
    getSupabaseAdmin.mockReturnValue(adminMock({ profileRole: "customer" }));
    const { evaluateAdminAccess } = await import("@/lib/auth/evaluateAdminAccess");
    const decision = await evaluateAdminAccess({ userId: "c1", email: "customer@example.com" });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.status).toBe(403);
  });

  it("allows profile role=admin even when ADMIN_EMAILS is empty", async () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    vi.stubEnv("ADMIN_EMAIL", "");
    getSupabaseAdmin.mockReturnValue(adminMock({ profileRole: "admin" }));
    const { evaluateAdminAccess } = await import("@/lib/auth/evaluateAdminAccess");
    const decision = await evaluateAdminAccess({ userId: "farai-id", email: "farai@shalean.com" });
    expect(decision).toEqual({ ok: true, via: "profile_role" });
  });
});
