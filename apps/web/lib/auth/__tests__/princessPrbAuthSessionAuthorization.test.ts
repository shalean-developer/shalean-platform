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

  it("builds an environment-owned recovery URL from the hashed token", async () => {
    const { buildPasswordResetRecoveryUrl } = await load();
    expect(
      buildPasswordResetRecoveryUrl(
        "https://pricing-test.shalean.co.za/auth/reset-password",
        "hash value",
      ),
    ).toBe(
      "https://pricing-test.shalean.co.za/auth/reset-password?token_hash=hash+value&type=recovery",
    );
    expect(
      buildPasswordResetRecoveryUrl(
        "https://pricing-test.shalean.co.za/auth/reset-password",
        "",
      ),
    ).toBeNull();
  });
});

describe("bootstrapPasswordRecoverySession", () => {
  it("verifies a direct recovery token hash and succeeds when session appears", async () => {
    const { bootstrapPasswordRecoverySession } = await import(
      "@/lib/auth/bootstrapPasswordRecoverySession"
    );
    const auth = {
      exchangeCodeForSession: vi.fn(async () => ({ error: null })),
      setSession: vi.fn(async () => ({ error: null })),
      verifyOtp: vi.fn(async () => ({ error: null })),
      getSession: vi.fn(async () => ({ data: { session: { access_token: "t" } } })),
    };
    const result = await bootstrapPasswordRecoverySession(
      auth,
      "https://pricing-test.shalean.co.za/auth/reset-password?token_hash=hashed&type=recovery",
      { pollAttempts: 1, pollDelayMs: 1 },
    );
    expect(result.ok).toBe(true);
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: "hashed",
      type: "recovery",
    });
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(auth.setSession).not.toHaveBeenCalled();
  });

  it("deduplicates concurrent one-time token verification", async () => {
    const { bootstrapPasswordRecoverySession } = await import(
      "@/lib/auth/bootstrapPasswordRecoverySession"
    );
    let releaseVerify!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseVerify = resolve;
    });
    const auth = {
      exchangeCodeForSession: vi.fn(async () => ({ error: null })),
      setSession: vi.fn(async () => ({ error: null })),
      verifyOtp: vi.fn(async () => {
        await gate;
        return { error: null };
      }),
      getSession: vi.fn(async () => ({ data: { session: { access_token: "t" } } })),
    };
    const href =
      "https://pricing-test.shalean.co.za/auth/reset-password?token_hash=once&type=recovery";
    const first = bootstrapPasswordRecoverySession(auth, href, {
      pollAttempts: 1,
      pollDelayMs: 1,
    });
    const second = bootstrapPasswordRecoverySession(auth, href, {
      pollAttempts: 1,
      pollDelayMs: 1,
    });
    releaseVerify();
    await expect(Promise.all([first, second])).resolves.toEqual([{ ok: true }, { ok: true }]);
    expect(auth.verifyOtp).toHaveBeenCalledTimes(1);
  });

  it("rejects token hashes without the recovery type before reading any existing session", async () => {
    const { bootstrapPasswordRecoverySession } = await import(
      "@/lib/auth/bootstrapPasswordRecoverySession"
    );
    const auth = {
      exchangeCodeForSession: vi.fn(async () => ({ error: null })),
      setSession: vi.fn(async () => ({ error: null })),
      verifyOtp: vi.fn(async () => ({ error: null })),
      getSession: vi.fn(async () => ({ data: { session: { access_token: "existing" } } })),
    };
    const result = await bootstrapPasswordRecoverySession(
      auth,
      "https://pricing-test.shalean.co.za/auth/reset-password?token_hash=hashed&type=email",
      { pollAttempts: 1, pollDelayMs: 1 },
    );
    expect(result.ok).toBe(false);
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(auth.getSession).not.toHaveBeenCalled();
  });

  it("exchanges PKCE code and succeeds when session appears", async () => {
    const { bootstrapPasswordRecoverySession } = await import(
      "@/lib/auth/bootstrapPasswordRecoverySession"
    );
    const auth = {
      exchangeCodeForSession: vi.fn(async () => ({ error: null })),
      setSession: vi.fn(async () => ({ error: null })),
      verifyOtp: vi.fn(async () => ({ error: null })),
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
      verifyOtp: vi.fn(async () => ({ error: null })),
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
      verifyOtp: vi.fn(async () => ({ error: null })),
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


describe("MASTER-01A-03A password recovery source-of-truth contract", () => {
  it("keeps forgot-password enumeration-safe UI aligned with its API contract", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(resolve(process.cwd(), "app/auth/forgot-password/page.tsx"), "utf8");
    expect(src).not.toContain("noAccount");
    expect(src).toContain("We sent a password reset link to your email.");
  });

  it("keeps reset password policy aligned with signup at 8 characters", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const reset = readFileSync(resolve(process.cwd(), "app/auth/reset-password/page.tsx"), "utf8");
    const signup = readFileSync(resolve(process.cwd(), "app/auth/signup/page.tsx"), "utf8");
    expect(reset).toContain("password.length < 8");
    expect(reset).toContain("minLength={8}");
    expect(signup).toContain("password.length < 8");
    expect(signup).toContain("minLength={8}");
  });

  it("does not document the retired auth callback as a live booking-link source", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(resolve(process.cwd(), "app/api/bookings/link-user/route.ts"), "utf8");
    expect(src).not.toContain("/auth/callback");
    expect(src).toContain("bearer token");
  });
});


describe("MASTER-01A-03B environment-owned recovery link contract", () => {
  it("uses hashed_token instead of Supabase action_link for Resend recovery emails", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(resolve(process.cwd(), "lib/auth/sendPasswordResetEmail.ts"), "utf8");
    expect(src).toContain("properties?.hashed_token");
    expect(src).toContain("buildPasswordResetRecoveryUrl");
    expect(src).not.toContain("properties?.action_link");
  });

  it("reset page scrubs the one-time token after verification", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(resolve(process.cwd(), "app/auth/reset-password/page.tsx"), "utf8");
    expect(src).toContain('searchParams.delete("token_hash")');
    expect(src).toContain("history.replaceState");
  });
});


describe("MASTER-01A-03B reset form recovery-authority contract", () => {
  it("does not unlock the reset form from a pre-existing unrelated session", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(resolve(process.cwd(), "app/auth/reset-password/page.tsx"), "utf8");
    expect(src).not.toContain("onAuthStateChange");
    expect(src).toContain("bootstrapPasswordRecoverySession");
    expect(src).toContain("if (result.ok)");
  });
});


describe("MASTER-01A-03B sensitive reset-route analytics exclusion", () => {
  it("marks the password reset route as analytics-excluded", async () => {
    const { isGa4PathExcluded } = await import("@/lib/analytics/ga4Config");
    expect(isGa4PathExcluded("/auth/reset-password")).toBe(true);
    expect(isGa4PathExcluded("/auth/reset-password/anything")).toBe(true);
  });

  it("gates every root third-party tracker before loading on the reset route", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const layout = readFileSync(resolve(process.cwd(), "app/layout.tsx"), "utf8");
    const meta = readFileSync(resolve(process.cwd(), "components/analytics/MetaPixel.tsx"), "utf8");
    const clarity = readFileSync(resolve(process.cwd(), "components/analytics/SessionReplayProvider.tsx"), "utf8");
    const ga = readFileSync(resolve(process.cwd(), "components/analytics/GoogleAnalytics.tsx"), "utf8");
    const ads = readFileSync(resolve(process.cwd(), "components/analytics/GoogleAds.tsx"), "utf8");
    const gtm = readFileSync(resolve(process.cwd(), "components/analytics/GoogleTagManager.tsx"), "utf8");

    expect(layout).toContain("GA4_PATH_EXCLUSION_SNIPPET");
    expect(layout).not.toMatch(/<script\s+src=["']https:\/\/analytics\.ahrefs\.com\/analytics\.js["']/);
    expect(meta).toContain("GA4_PATH_EXCLUSION_SNIPPET");
    expect(meta).not.toContain("<noscript>");
    expect(clarity).toContain("GA4_PATH_EXCLUSION_SNIPPET");
    expect(ga).toContain("GA4_PATH_EXCLUSION_SNIPPET");
    expect(ads).toContain("GA4_PATH_EXCLUSION_SNIPPET");
    expect(gtm).toContain("GA4_PATH_EXCLUSION_SNIPPET");
  });
});


describe("MASTER-01A-03B tracker re-bootstrap after sensitive route", () => {
  it("restores non-Google trackers after leaving the reset route", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const guard = readFileSync(resolve(process.cwd(), "components/analytics/Ga4RouteGuard.tsx"), "utf8");

    expect(guard).toContain("ensureNonGoogleTrackersBootstrapped");
    expect(guard).toContain("ensureMetaPixelBootstrapped");
    expect(guard).toContain("ensureClarityBootstrapped");
    expect(guard).toContain("ensureAhrefsBootstrapped");
    expect(guard).toContain("if (!excluded) {");
  });
});


describe("MASTER-01A-03B tracker scheduling idempotency", () => {
  it("marks deferred root trackers scheduled before the route guard can re-bootstrap them", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const meta = readFileSync(resolve(process.cwd(), "components/analytics/MetaPixel.tsx"), "utf8");
    const clarity = readFileSync(resolve(process.cwd(), "components/analytics/SessionReplayProvider.tsx"), "utf8");
    const layout = readFileSync(resolve(process.cwd(), "app/layout.tsx"), "utf8");
    const guard = readFileSync(resolve(process.cwd(), "components/analytics/Ga4RouteGuard.tsx"), "utf8");

    expect(meta).toContain("__shaleanMetaBootstrapScheduled=true");
    expect(clarity).toContain("__shaleanClarityBootstrapScheduled=true");
    expect(layout).toContain("__shaleanAhrefsBootstrapScheduled=true");
    expect(guard).toContain("window.__shaleanMetaBootstrapScheduled");
    expect(guard).toContain("window.__shaleanClarityBootstrapScheduled");
    expect(guard).toContain("window.__shaleanAhrefsBootstrapScheduled");
  });
});


describe("MASTER-01A-03B Meta re-bootstrap dispatch contract", () => {
  it("uses Meta's callMethod-aware queue semantics in the fallback stub", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const guard = readFileSync(resolve(process.cwd(), "components/analytics/Ga4RouteGuard.tsx"), "utf8");

    expect(guard).toContain('typeof fbq.callMethod === "function"');
    expect(guard).toContain("fbq.callMethod(...args)");
    expect(guard).toContain("fbq.queue = fbq.queue || []");
    expect(guard).toContain("fbq.queue.push(args)");
    expect(guard).not.toContain("fbq.q.push(args)");
  });
});


describe("MASTER-01A-03B tracker bootstrap script scope", () => {
  it("wraps Meta and Clarity generated scripts in IIFEs before using return-based exclusion snippets", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const meta = readFileSync(resolve(process.cwd(), "components/analytics/MetaPixel.tsx"), "utf8");
    const clarity = readFileSync(resolve(process.cwd(), "components/analytics/SessionReplayProvider.tsx"), "utf8");

    expect(meta).toContain('(function(){${bootstrap}})();');
    expect(clarity).toContain('(function(){${bootstrap}})();');
  });
});


describe("MASTER-01A-03B deferred tracker route recheck", () => {
  it("rechecks the exclusion policy inside deferred Meta and Clarity callbacks", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const meta = readFileSync(resolve(process.cwd(), "components/analytics/MetaPixel.tsx"), "utf8");
    const clarity = readFileSync(resolve(process.cwd(), "components/analytics/SessionReplayProvider.tsx"), "utf8");

    expect(meta.match(/GA4_PATH_EXCLUSION_SNIPPET/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(clarity.match(/GA4_PATH_EXCLUSION_SNIPPET/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
