import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("getPublicAppUrlBase", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function load() {
    const mod = await import("@/lib/email/appUrl");
    return mod.getPublicAppUrlBase;
  }

  it("uses localhost in development when NEXT_PUBLIC_APP_URL is unset", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    const getPublicAppUrlBase = await load();
    expect(getPublicAppUrlBase()).toBe("http://localhost:3000");
  });

  it("ignores localhost NEXT_PUBLIC_APP_URL in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://shalean.co.za");
    const getPublicAppUrlBase = await load();
    expect(getPublicAppUrlBase()).toBe("https://shalean.co.za");
  });

  it("honors a real production NEXT_PUBLIC_APP_URL", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://shalean.co.za");
    const getPublicAppUrlBase = await load();
    expect(getPublicAppUrlBase()).toBe("https://shalean.co.za");
  });
});
