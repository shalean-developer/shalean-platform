import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/supabase/supabaseMiddleware", () => ({ updateSession: vi.fn() }));
import { updateSession } from "@/lib/supabase/supabaseMiddleware";
import { proxy } from "@/proxy";
import nextConfig from "../../../next.config";
import { getRedirectUrl, unstable_getResponseFromNextConfig } from "next/experimental/testing/server";

const session = vi.mocked(updateSession);
const request = (path = "/blog/example") => new NextRequest(`https://pricing-test.shalean.co.za${path}`);

describe("SEO-ENV-01 non-production indexing guard", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "");
    vi.stubEnv("SHALEAN_APP_ENV", "staging");
    session.mockReset().mockResolvedValue(NextResponse.next());
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it.each(["staging", "stage", "development", "preview", "local"])("blocks a production build identified as %s", async (env) => {
    vi.stubEnv("SHALEAN_APP_ENV", env);
    expect((await proxy(request())).headers.get("X-Robots-Tag")).toContain("noindex");
  });
  it("preserves indexability for declared Plesk production", async () => {
    vi.stubEnv("SHALEAN_APP_ENV", "production");
    const response = await proxy(new NextRequest("https://shalean.co.za/blog/example"));
    expect(response.headers.get("X-Robots-Tag")).toBeNull();
  });
  it("protects early redirect responses on staging", async () => {
    const response = await proxy(request("/c/example"));
    expect(response.status).toBe(308);
    expect(response.headers.get("X-Robots-Tag")).toContain("noindex");
  });
  it("protects the passthrough response after session failure", async () => {
    session.mockRejectedValueOnce(new Error("session unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await proxy(request())).headers.get("X-Robots-Tag")).toContain("noindex");
  });
  it("retains Vercel preview protection even with an explicit production setting", async () => {
    vi.stubEnv("SHALEAN_APP_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect((await proxy(request())).headers.get("X-Robots-Tag")).toContain("noindex");
  });
  it("retains the production preview-token exclusion", async () => {
    vi.stubEnv("SHALEAN_APP_ENV", "production");
    const response = await proxy(request("/blog/example?preview=test-token"));
    expect(response.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  it.each([
    "/blog/deep-cleaning-vs-regular-cleaning-cape-town",
    "/blog/deep-vs-standard-cleaning-cape-town",
  ])("protects the actual Next.config redirect before proxy for %s", async (path) => {
    const response = await unstable_getResponseFromNextConfig({
      url: `https://pricing-test.shalean.co.za${path}?from=regression`, nextConfig,
    });
    expect(response.status).toBe(308);
    expect(getRedirectUrl(response)).toBe("https://pricing-test.shalean.co.za/blog/deep-cleaning-vs-regular-cleaning?from=regression");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noimageindex");
  });

  it("keeps the actual production config redirect indexable", async () => {
    vi.stubEnv("SHALEAN_APP_ENV", "production");
    const response = await unstable_getResponseFromNextConfig({
      url: "https://shalean.co.za/blog/deep-cleaning-vs-regular-cleaning-cape-town", nextConfig,
    });
    expect(response.status).toBe(308);
    expect(response.headers.get("X-Robots-Tag")).toBeNull();
  });

  it("also protects an unrelated legacy config redirect", async () => {
    const response = await unstable_getResponseFromNextConfig({
      url: "https://pricing-test.shalean.co.za/deep-cleaning", nextConfig,
    });
    expect(response.status).toBe(308);
    expect(getRedirectUrl(response)).toBe("https://pricing-test.shalean.co.za/services/deep-cleaning-cape-town");
    expect(response.headers.get("X-Robots-Tag")).toContain("noindex");
  });

  it("fails closed for a production build with no deployment identity", async () => {
    vi.stubEnv("SHALEAN_APP_ENV", "");
    const response = await unstable_getResponseFromNextConfig({
      url: "https://unknown.example/deep-cleaning", nextConfig,
    });
    expect(response.headers.get("X-Robots-Tag")).toContain("noindex");
  });

  it("protects config responses on preview even with an explicit production setting", async () => {
    vi.stubEnv("SHALEAN_APP_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "preview");
    const response = await unstable_getResponseFromNextConfig({
      url: "https://preview.example/blog/deep-cleaning-vs-regular-cleaning-cape-town", nextConfig,
    });
    expect(response.headers.get("X-Robots-Tag")).toContain("noindex");
  });
});
