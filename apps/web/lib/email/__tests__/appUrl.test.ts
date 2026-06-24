import { afterEach, describe, expect, it, vi } from "vitest";

describe("getPublicAppUrlBase", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
    vi.resetModules();
  });

  async function load() {
    const mod = await import("@/lib/email/appUrl");
    return mod.getPublicAppUrlBase;
  }

  it("uses localhost in development when NEXT_PUBLIC_APP_URL is unset", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.NEXT_PUBLIC_APP_URL;
    const getPublicAppUrlBase = await load();
    expect(getPublicAppUrlBase()).toBe("http://localhost:3000");
  });

  it("ignores localhost NEXT_PUBLIC_APP_URL in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    process.env.NEXT_PUBLIC_SITE_URL = "https://shalean.co.za";
    const getPublicAppUrlBase = await load();
    expect(getPublicAppUrlBase()).toBe("https://shalean.co.za");
  });

  it("honors a real production NEXT_PUBLIC_APP_URL", async () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_APP_URL = "https://shalean.co.za";
    const getPublicAppUrlBase = await load();
    expect(getPublicAppUrlBase()).toBe("https://shalean.co.za");
  });
});
