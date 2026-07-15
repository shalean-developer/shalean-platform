import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("getPasswordResetRedirectBase", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function load() {
    const mod = await import("@/lib/auth/passwordResetRedirect");
    return mod;
  }

  it("uses staging SITE_URL and never production apex on staging", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SHALEAN_APP_ENV", "staging");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv(
      "NEXT_PUBLIC_SITE_URL",
      "https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app",
    );
    const { getPasswordResetRedirectBase, passwordResetRedirectIsProductionLeak } = await load();
    const base = getPasswordResetRedirectBase();
    expect(base).toBe(
      "https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app",
    );
    expect(passwordResetRedirectIsProductionLeak(`${base}/auth/reset-password`)).toBe(false);
  });

  it("blocks mis-set production APP_URL on staging deployments", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SHALEAN_APP_ENV", "staging");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://shalean.co.za");
    const { getPasswordResetRedirectBase, STAGING_AUTH_ORIGIN } = await load();
    expect(getPasswordResetRedirectBase()).toBe(STAGING_AUTH_ORIGIN);
  });

  it("honors production APP_URL on production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SHALEAN_APP_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://shalean.co.za");
    const { getPasswordResetRedirectBase } = await load();
    expect(getPasswordResetRedirectBase()).toBe("https://shalean.co.za");
  });
});

describe("bootstrapPasswordRecoverySession", () => {
  it("exchanges PKCE code and succeeds when session appears", async () => {
    const { bootstrapPasswordRecoverySession } = await import(
      "@/lib/auth/bootstrapPasswordRecoverySession"
    );
    const auth = {
      exchangeCodeForSession: vi.fn(async () => ({ error: null })),
      setSession: vi.fn(async () => ({ error: null })),
      getSession: vi.fn(async () => ({ data: { session: { access_token: "t" } } })),
    };
    const result = await bootstrapPasswordRecoverySession(
      auth,
      "https://staging.example/auth/reset-password?code=abc",
      { pollAttempts: 1, pollDelayMs: 1 },
    );
    expect(result.ok).toBe(true);
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("abc");
  });

  it("rejects expired error query clearly", async () => {
    const { bootstrapPasswordRecoverySession } = await import(
      "@/lib/auth/bootstrapPasswordRecoverySession"
    );
    const auth = {
      exchangeCodeForSession: vi.fn(async () => ({ error: null })),
      setSession: vi.fn(async () => ({ error: null })),
      getSession: vi.fn(async () => ({ data: { session: null } })),
    };
    const result = await bootstrapPasswordRecoverySession(
      auth,
      "https://staging.example/auth/reset-password?error=access_denied&error_description=Email+link+is+invalid+or+has+expired",
      { pollAttempts: 1, pollDelayMs: 1 },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("expired_or_invalid");
      expect(result.message).toMatch(/expired/i);
    }
  });

  it("sets session from recovery hash tokens", async () => {
    const { bootstrapPasswordRecoverySession } = await import(
      "@/lib/auth/bootstrapPasswordRecoverySession"
    );
    const auth = {
      exchangeCodeForSession: vi.fn(async () => ({ error: null })),
      setSession: vi.fn(async () => ({ error: null })),
      getSession: vi.fn(async () => ({ data: { session: { access_token: "t" } } })),
    };
    const href =
      "https://staging.example/auth/reset-password#access_token=at&refresh_token=rt&type=recovery";
    const result = await bootstrapPasswordRecoverySession(auth, href, {
      pollAttempts: 1,
      pollDelayMs: 1,
    });
    expect(result.ok).toBe(true);
    expect(auth.setSession).toHaveBeenCalledWith({
      access_token: "at",
      refresh_token: "rt",
    });
  });
});

describe("admin dual-gate allowlist", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns operational 503 when ADMIN_EMAILS is empty", async () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    vi.stubEnv("ADMIN_EMAIL", "");
    const { evaluateAdminAllowlist, isAdminAllowlistConfigured } = await import("@/lib/auth/admin");
    expect(isAdminAllowlistConfigured()).toBe(false);
    const decision = evaluateAdminAllowlist("info@shalean.com");
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.status).toBe(503);
      expect(decision.error).toMatch(/ADMIN_EMAILS/i);
    }
  });

  it("allows exact allowlisted email and denies others", async () => {
    vi.stubEnv("ADMIN_EMAILS", "info@shalean.com,staging-admin@shalean.test");
    vi.stubEnv("ADMIN_EMAIL", "");
    const { evaluateAdminAllowlist, isAdmin } = await import("@/lib/auth/admin");
    expect(isAdmin("info@shalean.com")).toBe(true);
    expect(isAdmin("customer@example.com")).toBe(false);
    expect(evaluateAdminAllowlist("INFO@shalean.com")).toEqual({ ok: true });
    const denied = evaluateAdminAllowlist("customer@example.com");
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.status).toBe(403);
  });
});

describe("session recovery messaging", () => {
  it("maps expired and revoked failures", async () => {
    const {
      mapSessionFailureMessage,
      sessionRecoveryLoginPath,
      SESSION_EXPIRED_MESSAGE,
      SESSION_REVOKED_MESSAGE,
    } = await import("@/lib/auth/sessionRecovery");
    expect(mapSessionFailureMessage("Invalid or expired session.")).toBe(SESSION_EXPIRED_MESSAGE);
    expect(mapSessionFailureMessage("session revoked by admin")).toBe(SESSION_REVOKED_MESSAGE);
    expect(sessionRecoveryLoginPath("/office/bookings")).toBe(
      "/login?redirect=%2Foffice%2Fbookings",
    );
    expect(sessionRecoveryLoginPath("https://evil.example")).toBe("/login");
  });
});

describe("authorization matrix helpers", () => {
  it("safePostLoginRedirect enforces role dashboards", async () => {
    const { safePostLoginRedirect } = await import("@/lib/auth/userRole");
    expect(safePostLoginRedirect("/office", "customer")).toBe("/account");
    expect(safePostLoginRedirect("/jobs/list", "customer")).toBe("/account");
    expect(safePostLoginRedirect("/office/bookings", "admin")).toBe("/office/bookings");
    expect(safePostLoginRedirect("/jobs", "cleaner")).toBe("/jobs");
    expect(safePostLoginRedirect("/account", "cleaner")).toBe("/jobs");
  });

  it("denies cross-tenant address ownership", async () => {
    const { customerOwnsAddressRow } = await import("@/lib/customer/customerAddresses");
    const owner = "11111111-1111-4111-8111-111111111111";
    const other = "22222222-2222-4222-8222-222222222222";
    expect(customerOwnsAddressRow({ user_id: owner }, owner)).toBe(true);
    expect(customerOwnsAddressRow({ user_id: other }, owner)).toBe(false);
  });

  it("office portal path detection stays strict", async () => {
    const { isOfficePortalPath } = await import("@/lib/auth/officePortalPath");
    expect(isOfficePortalPath("/office")).toBe(true);
    expect(isOfficePortalPath("/office/bookings")).toBe(true);
    expect(isOfficePortalPath("/office-cleaning/cape-town")).toBe(false);
  });
});

describe("login link-user non-blocking contract", () => {
  it("linkBookingsToUserAfterAuth does not throw on network failure", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock);
    const { linkBookingsToUserAfterAuth } = await import("@/lib/booking/clientLinkBookings");
    await expect(
      linkBookingsToUserAfterAuth("token", { id: "u1", email: "a@b.com" }),
    ).resolves.toBeUndefined();
  });
});
